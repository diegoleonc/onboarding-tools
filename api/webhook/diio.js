// Vercel Serverless Function: Receive DIIO webhook and update Asana project status
// Handles meeting.finished events only
import crypto from 'crypto';
import { Redis } from '@upstash/redis';

const ASANA_BASE = 'https://app.asana.com/api/1.0';

const PORTFOLIOS = [
  '1203602528347966', // 01 Set Up
  '1203602528347970', // 02 Upgrade
  '1203602528347974', // 03 Reonboarding
];

// Supported event types
const SUPPORTED_ACTIONS = ['meeting.finished'];

// Status severity order (higher = worse)
const STATUS_SEVERITY = {
  'on_track': 0,    // En curso
  'at_risk': 1,     // En riesgo
  'off_track': 2,   // Con retraso
  'on_hold': 3,     // En espera (manual only — never set by webhook)
  'complete': 4,    // Finalizado (manual only — never set by webhook)
};

// Human-managed statuses that the webhook should NEVER override
const MANUAL_ONLY_STATUSES = ['on_hold', 'complete'];

// ===== SIGNATURE VALIDATION =====
function validateSignature(req, body) {
  const signingSecret = process.env.DIIO_SIGNING_SECRET;
  if (!signingSecret) return true; // Skip validation if no secret configured

  const signature = req.headers['do-signature'];
  const timestamp = req.headers['do-timestamp'];
  const webhookId = body.webhook_id || body.id;

  if (!signature || !timestamp) return false;

  const sign = `${webhookId}-${timestamp}`;
  const computed = crypto.createHmac('sha256', signingSecret).update(sign).digest('hex');

  return computed === signature;
}

// ===== STRIP MARKDOWN FOR ASANA (plain text only) =====
function stripMarkdown(text) {
  if (!text) return text;
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** → bold
    .replace(/\*(.+?)\*/g, '$1')        // *italic* → italic
    .replace(/__(.*?)__/g, '$1')         // __underline__ → underline
    .replace(/~~(.*?)~~/g, '$1')         // ~~strike~~ → strike
    .replace(/^#{1,6}\s+/gm, '')         // # headers → plain text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // [link](url) → link
}

// ===== EXTRACT COMPANY NAME FROM MEETING NAME =====
function extractCompanyName(meetingName) {
  // Clean up: strip leading dashes, dots, spaces, special chars
  // Fixes names like "- Sofía Abuhadba" → "Sofía Abuhadba"
  const cleaned = meetingName.replace(/^[\s\-–—·•.,;:]+/, '').trim();
  if (!cleaned) return meetingName.trim();

  // Convention: "[NombreEmpresa] - Onboarding Multivende"
  const patterns = [
    /^(.+?)\s*-\s*Onboarding Multivende/i,
    /^(.+?)\s*-\s*Onboarding/i,
    /^(.+?)\s*-\s*/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const name = match[1].trim();
      if (name.length >= 2) return name;
    }
  }

  return cleaned;
}

// ===== SMART STATUS COMPUTATION (Option 4) =====
// Combines: project due date + DIIO success_odds + current Asana status
// Rules:
//   1. If current status is "En espera" or "Finalizado" → don't touch it
//   2. If project is past due → always "Con retraso" (date wins over success_odds)
//   3. If project is near deadline (≤5 days) → minimum "En riesgo"
//   4. If project is on time → success_odds decides: low→Con retraso, mid→En riesgo, high→En curso
//   5. If no due date → success_odds only
async function computeSmartStatus(projectGid, successOdds, token) {
  // Fetch project details: due date, current status, task completion
  const projectData = await asanaRequest(
    `/projects/${projectGid}?opt_fields=due_on,current_status_update,current_status_update.status_type,custom_fields,custom_fields.name,custom_fields.display_value`,
    token
  );

  const project = projectData?.data;
  if (!project) {
    // Fallback: just use success_odds
    const fallbackStatus = computeSuccessStatus(successOdds);
    return {
      statusType: fallbackStatus,
      skipped: false,
      reason: `Sin datos del proyecto, success_odds: ${successOdds ?? 'N/A'}`,
    };
  }

  // Check current Asana status
  const currentStatusType = project.current_status_update?.status_type;

  // Rule 1: Never override manual statuses
  if (MANUAL_ONLY_STATUSES.includes(currentStatusType)) {
    return {
      statusType: currentStatusType,
      skipped: true,
      reason: `Estado actual "${currentStatusType}" es gestionado manualmente`,
    };
  }

  // Get due date
  const dueOn = project.due_on; // "YYYY-MM-DD" or null

  // Calculate date-based status
  let dateStatus = null;
  let daysRemaining = null;

  if (dueOn) {
    const now = new Date();
    const due = new Date(dueOn + 'T23:59:59');
    daysRemaining = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      dateStatus = 'off_track'; // Past due → Con retraso (immovable)
    } else if (daysRemaining <= 5) {
      dateStatus = 'at_risk'; // Near deadline → minimum En riesgo
    } else {
      dateStatus = 'on_track'; // On time
    }
  }

  // Calculate success_odds-based status
  const sentimentStatus = computeSuccessStatus(successOdds);

  // Combine: take the WORST between date and sentiment
  let finalStatus;
  let reason;

  if (dateStatus === 'off_track') {
    // Rule 2: Past due always wins → Con retraso
    finalStatus = 'off_track';
    reason = `Proyecto pasado de fecha (${Math.abs(daysRemaining)} días de atraso)`;
  } else if (dateStatus === 'at_risk') {
    // Rule 3: Near deadline → minimum En riesgo, sentiment can make it worse (not better)
    finalStatus = STATUS_SEVERITY[sentimentStatus] > STATUS_SEVERITY['at_risk']
      ? sentimentStatus
      : 'at_risk';
    reason = `Cerca del deadline (${daysRemaining} días)`;
  } else if (dateStatus === 'on_track') {
    // Rule 4: On time → sentiment decides
    finalStatus = sentimentStatus;
    reason = `A tiempo (${daysRemaining} días restantes)`;
  } else {
    // Rule 5: No due date → sentiment only
    finalStatus = sentimentStatus;
    reason = `Sin fecha límite`;
  }

  return {
    statusType: finalStatus,
    skipped: false,
    reason,
    daysRemaining,
    dateStatus,
    sentimentStatus,
    currentStatusType,
  };
}

// Success odds → Asana status mapping
// DIIO success_odds scale: 1 (very low) → 5 (very high)
// Asana statuses: off_track (red), at_risk (yellow), on_track (green)
function computeSuccessStatus(successOdds) {
  if (successOdds === undefined || successOdds === null) return 'on_track';
  const val = typeof successOdds === 'string' ? parseFloat(successOdds) : successOdds;
  if (isNaN(val)) return 'on_track';
  if (val <= 2) return 'at_risk';      // 1-2 → En riesgo (yellow)
  return 'on_track';                    // 3-5 → En curso (green)
}

// Human-readable sentiment label with emoji (scale 1-3: client feeling)
function sentimentLabel(sentiment) {
  if (sentiment === undefined || sentiment === null) return '';
  const val = typeof sentiment === 'string' ? parseFloat(sentiment) : sentiment;
  if (isNaN(val)) return '';
  const labels = {
    1: '😟 Negativo',
    2: '😐 Neutral',
    3: '😊 Positivo',
  };
  return labels[val] || `Sentiment: ${val}`;
}

// Human-readable success odds label with emoji (scale 1-5: predicted success)
function successOddsLabel(odds) {
  if (odds === undefined || odds === null) return '';
  const val = typeof odds === 'string' ? parseFloat(odds) : odds;
  if (isNaN(val)) return '';
  const labels = {
    1: '🔴 Muy baja',
    2: '🟠 Baja',
    3: '🟡 Media',
    4: '🟢 Alta',
    5: '🟢 Muy alta',
  };
  return labels[val] || `Predicción: ${val}`;
}

// ===== CHECK IF PROJECT BELONGS TO OUR PORTFOLIOS =====
async function isProjectInPortfolios(projectGid, token) {
  const projectData = await asanaRequest(
    `/projects/${projectGid}?opt_fields=completed,name`,
    token
  );
  if (!projectData?.data || projectData.data.completed) return null;

  for (const portfolioGid of PORTFOLIOS) {
    const items = await asanaRequest(
      `/portfolios/${portfolioGid}/items?opt_fields=name&limit=100`,
      token
    );
    if (items?.data?.some((p) => p.gid === projectGid)) {
      return projectData.data;
    }
  }
  return null;
}

// ===== FIND MATCHING ASANA PROJECT =====
async function findAsanaProject(companyName, sellerEmails, token) {
  // Strategy 1: Typeahead search (then verify it's in our 3 portfolios)
  const searchResults = await asanaRequest(
    `/workspaces/592491987465948/typeahead?resource_type=project&query=${encodeURIComponent(companyName)}&count=10`,
    token
  );

  // Minimum company name length to avoid false positives (e.g. "Bu" matching "Bubba")
  const MIN_COMPANY_NAME_LENGTH = 3;

  if (companyName.length >= MIN_COMPANY_NAME_LENGTH && searchResults?.data?.length > 0) {
    for (const result of searchResults.data) {
      const projectName = result.name.toLowerCase();
      const searchName = companyName.toLowerCase();

      // Only match if search name appears at the START of the project name
      // This prevents "Abuhadba" from matching "Bubba Uruguay - ..."
      if (projectName.startsWith(searchName)) {
        const project = await isProjectInPortfolios(result.gid, token);
        if (project) return project;
      }

      // Also match if the project name part before the dash starts with search name
      const projectPrefix = projectName.split(/\s*-\s*/)[0].trim();
      if (projectPrefix.startsWith(searchName) || searchName.startsWith(projectPrefix)) {
        const project = await isProjectInPortfolios(result.gid, token);
        if (project) return project;
      }
    }
  }

  // Strategy 2: Search through portfolios for prefix match
  if (companyName.length >= MIN_COMPANY_NAME_LENGTH) {
    for (const portfolioGid of PORTFOLIOS) {
      const items = await asanaRequest(
        `/portfolios/${portfolioGid}/items?opt_fields=name,completed&limit=100`,
        token
      );

      if (items?.data) {
        for (const project of items.data) {
          if (project.completed) continue;
          const projectNameLower = project.name.toLowerCase();
          const searchNameLower = companyName.toLowerCase();

          // Extract project company name (part before first dash)
          const projectCompany = projectNameLower.split(/\s*-\s*/)[0].trim();

          // Exact company name match at the start
          if (projectCompany.startsWith(searchNameLower) || searchNameLower.startsWith(projectCompany)) {
            return project;
          }

          // Fuzzy: all words must appear, but ONLY match against the company part (before dash)
          // AND require minimum 2 words with each word at least 3 chars
          const words = searchNameLower.split(/\s+/).filter(w => w.length >= 3);
          if (words.length >= 2 && words.every(w => projectCompany.includes(w))) {
            return project;
          }
        }
      }
    }
  }

  // Strategy 3 (seller email match) REMOVED — caused false positives.
  // When the implementer had only 1 project, ANY meeting would match it
  // even if the company name was completely different (e.g. "Bata Colombia"
  // matching "Cueros Velez USA" because same implementer).
  // Better to log "no match" than associate incorrectly.

  return null;
}

// ===== CREATE ASANA STATUS UPDATE =====
async function createStatusUpdate(projectGid, meetingData, token) {
  const tv = meetingData.tracker_values || {};
  const summary = stripMarkdown(tv.summary?.value) || 'Sin resumen disponible';
  const pains = stripMarkdown(tv.customer_pains?.value);
  const objections = stripMarkdown(tv.objections?.value);
  const unresolvedQueries = stripMarkdown(tv.unresolve_queries?.value);
  const commitments = meetingData.commitments;
  // DIIO sends duration in seconds — convert to minutes
  const rawDuration = meetingData.duration;
  const duration = rawDuration ? Math.round(rawDuration / 60) : null;
  // Extract both fields:
  // - sentiment: client feeling (1-3 scale) — informational only
  // - success_odds: predicted success (1-5 scale) — drives Asana status
  const sentiment = tv.sentiment?.value ?? tv.sentiment ?? null;
  const successOdds = tv.success_odds?.value ?? tv.success_odds ?? null;

  console.log('TRACKER VALUES DEBUG (meeting):', JSON.stringify({
    sentiment, successOdds,
    allTrackerKeys: Object.keys(tv),
    rawSentiment: tv.sentiment,
    rawSuccessOdds: tv.success_odds,
  }));

  const meetingDate = meetingData.scheduled_at
    ? new Date(meetingData.scheduled_at).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('es-CL');

  // Compute smart status using success_odds (NOT sentiment)
  const statusResult = await computeSmartStatus(projectGid, successOdds, token);

  if (statusResult.skipped) {
    console.log(`Skipping status change for project ${projectGid}: ${statusResult.reason}`);
  }

  // Build status update text
  const meetingName = meetingData.name || '';
  let text = `📋 Resumen reunión ${meetingDate}`;
  if (duration) text += ` (${duration} min)`;
  if (meetingName) text += `\n📎 Reunión DIIO: ${meetingName}`;
  const soLabel = successOddsLabel(successOdds);
  if (soLabel) text += `\n🎯 Predicción de éxito: ${soLabel} (${successOdds}/5)`;
  const sLabel = sentimentLabel(sentiment);
  if (sLabel) text += `\n💬 Sentimiento del cliente: ${sLabel} (${sentiment}/3)`;
  text += `\n\n${summary}`;

  if (pains) {
    text += `\n\n🔴 Dolores del cliente:\n${pains}`;
  }

  if (objections) {
    text += `\n\n⚠️ Objeciones:\n${objections}`;
  }

  if (unresolvedQueries) {
    text += `\n\n❓ Temas pendientes:\n${unresolvedQueries}`;
  }

  if (commitments) {
    text += `\n\n✅ Compromisos:`;
    if (typeof commitments === 'object' && !Array.isArray(commitments)) {
      text += `\n- ${commitments.todo || ''}`;
      if (commitments.who) text += ` (Responsable: ${commitments.who})`;
      if (commitments.deadline) {
        const dl = new Date(commitments.deadline).toLocaleDateString('es-CL');
        text += ` — Plazo: ${dl}`;
      }
    } else if (Array.isArray(commitments)) {
      for (const c of commitments) {
        text += `\n- ${c.todo || ''}`;
        if (c.who) text += ` (${c.who})`;
        if (c.deadline) text += ` — ${new Date(c.deadline).toLocaleDateString('es-CL')}`;
      }
    }
  }

  // Participants info
  const sellers = meetingData.attendees?.sellers?.map(s => s.name).join(', ') || '';
  const customers = meetingData.attendees?.customers?.map(c => c.name).join(', ') || '';
  if (sellers || customers) {
    text += `\n\n👥 Participantes: ${[sellers, customers].filter(Boolean).join(' | ')}`;
  }

  text += `\n— Actualización automática vía DIIO`;

  // Create the status update via Asana API
  const response = await asanaRequest('/status_updates', token, 'POST', {
    data: {
      parent: projectGid,
      status_type: statusResult.statusType,
      title: `Reunión ${meetingDate} — Resumen DIIO`,
      text: text,
    },
  });

  return response;
}

// ===== ASANA API HELPER =====
async function asanaRequest(path, token, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${ASANA_BASE}${path}`, options);

  if (!res.ok) {
    const err = await res.text();
    console.error(`Asana API error ${res.status} on ${path}:`, err);
    return null;
  }

  return res.json();
}

// ===== LOG WEBHOOK EVENT =====
// ===== REDIS WEBHOOK LOG =====
let _redis = null;
function getRedis() {
  if (!_redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return _redis;
}

async function logEvent(action, meetingName, projectName, success, details = '', extra = {}) {
  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: action || 'unknown',
    type: 'meeting',
    name: meetingName || '',
    projectMatch: projectName || null,
    success,
    details,
    ...extra,
  };

  // Always console.log
  console.log(JSON.stringify(entry));

  // Store in Redis (non-blocking — don't let Redis failures break the webhook)
  try {
    const redis = getRedis();
    if (redis) {
      // Store as sorted set (score = timestamp for ordering)
      const score = Date.now();
      await redis.zadd('webhook:logs', { score, member: JSON.stringify(entry) });
      // Keep only last 500 entries to stay within free tier
      await redis.zremrangebyrank('webhook:logs', 0, -501);
    }
  } catch (err) {
    console.error('Redis log error (non-fatal):', err.message);
  }
}

// ===== MAIN HANDLER =====
export default async function handler(req, res) {
  // Handle DIIO webhook validation (GET request with echo_string)
  if (req.method === 'GET') {
    const echoString = req.query.echo_string;
    if (echoString) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(echoString);
    }
    return res.status(200).json({ status: 'ok', message: 'DIIO webhook endpoint active' });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.ASANA_PAT;
  if (!token) {
    console.error('ASANA_PAT not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const body = req.body;

  // Log every incoming webhook for debugging
  const _tv = body.tracker_values || {};
  console.log('DIIO webhook received:', JSON.stringify({
    action: body.action,
    id: body.id,
    integration_type: body.integration_type,
    name: body.name,
    hasTrackerValues: !!body.tracker_values,
    trackerKeys: body.tracker_values ? Object.keys(body.tracker_values) : [],
    rawSentiment: _tv.sentiment,
    rawSuccessOdds: _tv.success_odds,
    keys: Object.keys(body),
  }));

  // Validate signature
  if (!validateSignature(req, body)) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const action = body.action;

  if (!SUPPORTED_ACTIONS.includes(action)) {
    logEvent(action || 'unknown', body.name || body.id, null, true,
      `Skipped - unsupported event. Keys: ${Object.keys(body).join(', ')}`);
    return res.status(200).json({ status: 'ok', message: `Skipped event: ${action || 'unknown'}` });
  }

  try {
    // ===== MEETING FINISHED =====
    if (action === 'meeting.finished') {
      const meetingName = body.name || '';
      const companyName = extractCompanyName(meetingName);
      const sellerEmails = body.attendees?.sellers?.map(s => s.email) || [];

      const tv = body.tracker_values || {};
      const sentiment = tv.sentiment?.value ?? tv.sentiment ?? null;
      const successOdds = tv.success_odds?.value ?? tv.success_odds ?? null;

      logEvent(action, meetingName, null, true, `Extracted company: "${companyName}"`, {
        sentiment,
        successOdds,
        rawSuccessOdds: tv.success_odds,
        meetingId: body.id,
        sellerEmails,
        companyExtracted: companyName,
      });

      const project = await findAsanaProject(companyName, sellerEmails, token);

      if (!project) {
        logEvent(action, meetingName, null, false, `No project found for company: "${companyName}"`, {
          sentiment,
          successOdds,
          companyExtracted: companyName,
        });
        return res.status(200).json({
          status: 'warning',
          message: `No matching Asana project found for "${companyName}"`,
          meetingName,
          companyExtracted: companyName,
          _debug: { sentiment, successOdds, trackerKeys: Object.keys(tv) },
        });
      }

      const statusUpdate = await createStatusUpdate(project.gid, body, token);

      if (statusUpdate) {
        logEvent(action, meetingName, project.name, true, 'Status update created', {
          sentiment,
          successOdds,
          meetingId: body.id,
        });
        return res.status(200).json({
          status: 'success',
          message: `Status update created on "${project.name}"`,
          projectGid: project.gid,
          statusUpdateGid: statusUpdate.data?.gid,
          _debug: { sentiment, successOdds, trackerKeys: Object.keys(tv) },
        });
      } else {
        logEvent(action, meetingName, project.name, false, 'Failed to create status update');
        return res.status(500).json({
          status: 'error',
          message: `Failed to create status update on "${project.name}"`,
        });
      }
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    logEvent(action, body.name || body.id, null, false, error.message);
    return res.status(500).json({ error: error.message });
  }
}
