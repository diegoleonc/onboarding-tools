// Vercel Serverless Function: Receive DIIO webhook and update Asana project status
// Handles both meeting.finished and written_conversation.finished events
import crypto from 'crypto';

const ASANA_BASE = 'https://app.asana.com/api/1.0';

const PORTFOLIOS = [
  '1203602528347966', // 01 Set Up
  '1203602528347970', // 02 Upgrade
  '1203602528347974', // 03 Reonboarding
];

// Supported event types
const SUPPORTED_ACTIONS = ['meeting.finished', 'written_conversation.finished'];

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

// ===== EXTRACT COMPANY NAME FROM MEETING NAME =====
function extractCompanyName(meetingName) {
  // Convention: "[NombreEmpresa] - Onboarding Multivende"
  const patterns = [
    /^(.+?)\s*-\s*Onboarding Multivende/i,
    /^(.+?)\s*-\s*Onboarding/i,
    /^(.+?)\s*-\s*/i,
  ];

  for (const pattern of patterns) {
    const match = meetingName.match(pattern);
    if (match) return match[1].trim();
  }

  return meetingName.trim();
}

// ===== SMART STATUS COMPUTATION (Option 4) =====
// Combines: project due date + DIIO sentiment + current Asana status
// Rules:
//   1. If current status is "En espera" or "Finalizado" → don't touch it
//   2. If project is past due → always "Con retraso" (date wins over sentiment)
//   3. If project is near deadline (≤5 days) → minimum "En riesgo"
//   4. If project is on time → sentiment decides: bad→En riesgo, good→En curso
//   5. If no due date → sentiment only decides between En curso / En riesgo
async function computeSmartStatus(projectGid, sentiment, token) {
  // Fetch project details: due date, current status, task completion
  const projectData = await asanaRequest(
    `/projects/${projectGid}?opt_fields=due_on,current_status_update,current_status_update.status_type,custom_fields,custom_fields.name,custom_fields.display_value`,
    token
  );

  const project = projectData?.data;
  if (!project) {
    // Fallback: just use sentiment
    const fallbackStatus = computeSentimentStatus(sentiment);
    return {
      statusType: fallbackStatus,
      skipped: false,
      reason: `Sin datos del proyecto, sentiment: ${sentiment ?? 'N/A'}`,
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

  // Calculate sentiment-based status
  const sentimentStatus = computeSentimentStatus(sentiment);

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
    reason = `Cerca del deadline (${daysRemaining} días), sentiment: ${sentiment ?? 'N/A'}`;
  } else if (dateStatus === 'on_track') {
    // Rule 4: On time → sentiment decides
    finalStatus = sentimentStatus;
    reason = `A tiempo (${daysRemaining} días restantes), sentiment: ${sentiment ?? 'N/A'}`;
  } else {
    // Rule 5: No due date → sentiment only
    finalStatus = sentimentStatus;
    reason = `Sin fecha límite, sentiment: ${sentiment ?? 'N/A'}`;
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

// Simple sentiment → status mapping (used as one input to the composite)
// DIIO scale: 1 (very negative) → 5 (very positive)
// Asana statuses: off_track (red), at_risk (yellow), on_track (green)
function computeSentimentStatus(sentiment) {
  if (sentiment === undefined || sentiment === null) return 'on_track';
  const val = typeof sentiment === 'string' ? parseFloat(sentiment) : sentiment;
  if (isNaN(val)) return 'on_track';
  if (val <= 3) return 'at_risk';     // 1-3 → En riesgo (yellow)
  return 'on_track';                   // 4-5 → En curso (green)
}

// Human-readable sentiment label with emoji
function sentimentLabel(sentiment) {
  if (sentiment === undefined || sentiment === null) return '';
  const val = typeof sentiment === 'string' ? parseFloat(sentiment) : sentiment;
  if (isNaN(val)) return '';
  const labels = {
    1: '😡 Muy negativo',
    2: '😟 Negativo',
    3: '😐 Neutral',
    4: '😊 Positivo',
    5: '🤩 Muy positivo',
  };
  return labels[val] || `Sentiment: ${val}`;
}

// ===== EXTRACT COMPANY NAME FROM CONVERSATION TITLE =====
// DIIO conversation names follow patterns like:
//   "Conversación con Línea Estética Colombia - Multivende"
//   "Conversación con Empresa XYZ"
//   "Empresa ABC - Multivende"
function extractCompanyFromConversationName(conversationName) {
  if (!conversationName) return null;

  const patterns = [
    // "Conversación con [Company] - Multivende"
    /^Conversaci[oó]n\s+con\s+(.+?)\s*-\s*Multivende/i,
    // "Conversación con [Company]"
    /^Conversaci[oó]n\s+con\s+(.+?)$/i,
    // "[Company] - Multivende" (same as meetings)
    /^(.+?)\s*-\s*Multivende/i,
    // "[Company] - Onboarding Multivende"
    /^(.+?)\s*-\s*Onboarding/i,
    // Fallback: "[Company] - whatever"
    /^(.+?)\s*-\s*/i,
  ];

  for (const pattern of patterns) {
    const match = conversationName.match(pattern);
    if (match) {
      const name = match[1].trim();
      if (name.length >= 2) return name;
    }
  }

  return null;
}

// ===== EXTRACT INFO FROM WHATSAPP CONVERSATION =====
function extractConversationInfo(body) {
  const participants = body.participants || [];

  // Separate contacts (clients) from users (implementers)
  const contacts = [];
  const users = [];

  if (Array.isArray(participants)) {
    for (const p of participants) {
      if (p.email) {
        users.push(p); // Users have email (implementers)
      } else if (p.name || p.phone_numbers) {
        contacts.push(p); // Contacts have name/phone (clients)
      }
    }
  }

  // Also check if participants is an object with specific structure
  if (!Array.isArray(participants) && typeof participants === 'object') {
    if (participants.users) users.push(...(Array.isArray(participants.users) ? participants.users : [participants.users]));
    if (participants.contacts) contacts.push(...(Array.isArray(participants.contacts) ? participants.contacts : [participants.contacts]));
  }

  // Extract best candidate for company name from contact names
  const contactNames = contacts.map(c => c.name).filter(Boolean);
  const userEmails = users.map(u => u.email).filter(Boolean);

  return { contactNames, userEmails, contacts, users };
}

// ===== FIND ASANA PROJECT FOR WHATSAPP CONVERSATION =====
async function findAsanaProjectForConversation(conversationName, contactNames, userEmails, token) {
  // Strategy 0 (BEST): Extract company from conversation title (e.g. "Conversación con Empresa - Multivende")
  const companyFromTitle = extractCompanyFromConversationName(conversationName);
  if (companyFromTitle) {
    console.log(`Conversation title match: extracted "${companyFromTitle}" from "${conversationName}"`);

    // Use the same matching logic as meetings — typeahead + portfolio verification
    const searchResults = await asanaRequest(
      `/workspaces/592491987465948/typeahead?resource_type=project&query=${encodeURIComponent(companyFromTitle)}&count=10`,
      token
    );

    if (searchResults?.data?.length > 0) {
      for (const result of searchResults.data) {
        const projectName = result.name.toLowerCase();
        const searchName = companyFromTitle.toLowerCase();

        if (projectName.includes(searchName) || searchName.includes(projectName.split(' ')[0])) {
          const project = await isProjectInPortfolios(result.gid, token);
          if (project) {
            return { project, matchedBy: 'conversation_title', matchedValue: companyFromTitle };
          }
        }
      }
    }

    // Fallback: portfolio scan with company name from title
    for (const portfolioGid of PORTFOLIOS) {
      const items = await asanaRequest(
        `/portfolios/${portfolioGid}/items?opt_fields=name,completed&limit=100`,
        token
      );

      if (items?.data) {
        for (const project of items.data) {
          if (project.completed) continue;
          const projectNameLower = project.name.toLowerCase();
          const searchNameLower = companyFromTitle.toLowerCase();

          if (projectNameLower.includes(searchNameLower) || searchNameLower.includes(projectNameLower.split(' ')[0])) {
            return { project, matchedBy: 'conversation_title_portfolio', matchedValue: companyFromTitle };
          }

          const words = searchNameLower.split(/\s+/).filter(w => w.length > 2);
          if (words.length > 1 && words.every(w => projectNameLower.includes(w))) {
            return { project, matchedBy: 'conversation_title_fuzzy', matchedValue: companyFromTitle };
          }
        }
      }
    }
  }

  // Strategy 1: Search by contact names
  for (const contactName of contactNames) {
    // Clean the contact name - remove common prefixes/suffixes
    const cleanName = contactName
      .replace(/^\+?\d[\d\s-]+/, '') // Remove phone number prefixes
      .replace(/\s*\(.*?\)\s*/g, '') // Remove parenthetical info
      .trim();

    if (cleanName.length < 2) continue;

    // Try typeahead search
    const searchResults = await asanaRequest(
      `/workspaces/592491987465948/typeahead?resource_type=project&query=${encodeURIComponent(cleanName)}&count=10`,
      token
    );

    if (searchResults?.data?.length > 0) {
      for (const result of searchResults.data) {
        const projectName = result.name.toLowerCase();
        const searchName = cleanName.toLowerCase();

        if (projectName.includes(searchName)) {
          const project = await isProjectInPortfolios(result.gid, token);
          if (project) {
            return { project, matchedBy: 'contact_name_typeahead', matchedValue: cleanName };
          }
        }
      }
    }

    // Try portfolio scan
    for (const portfolioGid of PORTFOLIOS) {
      const items = await asanaRequest(
        `/portfolios/${portfolioGid}/items?opt_fields=name,completed&limit=100`,
        token
      );

      if (items?.data) {
        for (const project of items.data) {
          if (project.completed) continue;
          const projectNameLower = project.name.toLowerCase();
          const searchNameLower = cleanName.toLowerCase();

          if (projectNameLower.includes(searchNameLower) || searchNameLower.includes(projectNameLower.split(' ')[0])) {
            return { project, matchedBy: 'contact_name_portfolio', matchedValue: cleanName };
          }

          // Fuzzy: all words match
          const words = searchNameLower.split(/\s+/).filter(w => w.length > 2);
          if (words.length > 1 && words.every(w => projectNameLower.includes(w))) {
            return { project, matchedBy: 'contact_name_fuzzy', matchedValue: cleanName };
          }
        }
      }
    }
  }

  // Strategy 2: Match by implementer email → project owner (unique match only)
  if (userEmails.length > 0) {
    const candidateProjects = [];
    for (const portfolioGid of PORTFOLIOS) {
      const items = await asanaRequest(
        `/portfolios/${portfolioGid}/items?opt_fields=name,completed,owner,owner.email&limit=100`,
        token
      );

      if (items?.data) {
        const owned = items.data.filter(
          p => !p.completed && userEmails.includes(p.owner?.email)
        );
        candidateProjects.push(...owned);
      }
    }

    // Only return if there's exactly one match (otherwise ambiguous)
    if (candidateProjects.length === 1) {
      return { project: candidateProjects[0], matchedBy: 'implementer_email', matchedValue: userEmails[0] };
    }

    // If multiple matches, log for debugging but don't return
    if (candidateProjects.length > 1) {
      console.log(`Multiple projects (${candidateProjects.length}) found for implementer ${userEmails[0]}: ${candidateProjects.map(p => p.name).join(', ')}`);
    }
  }

  return null;
}

// ===== CREATE ASANA STATUS UPDATE FOR CONVERSATION =====
async function createConversationStatusUpdate(projectGid, body, matchInfo, token) {
  const tv = body.tracker_values || {};
  const summary = tv.summary?.value || 'Sin resumen disponible';
  const pains = tv.customer_pains?.value;
  const objections = tv.objections?.value;
  const unresolvedQueries = tv.unresolve_queries?.value;
  const sentiment = tv.sentiment?.value;
  const playbook = body.playbook?.name || '';
  const convType = body.conversation_type || body.type || '';

  // Compute smart status
  const statusResult = await computeSmartStatus(projectGid, sentiment, token);

  // If status is manually managed, still create the update but preserve the status
  if (statusResult.skipped) {
    console.log(`Skipping status change for project ${projectGid}: ${statusResult.reason}`);
  }

  const today = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Extract company name from conversation title for a cleaner display
  const companyFromTitle = extractCompanyFromConversationName(body.name);

  // Build status update text
  let text = `💬 Resumen conversación WhatsApp — ${today}`;
  if (convType) text += `\nTipo: ${convType}`;
  if (playbook) text += `\nPlaybook: ${playbook}`;
  const sLabel = sentimentLabel(sentiment);
  if (sLabel) text += `\n🎯 Sentimiento del cliente: ${sLabel} (${sentiment}/5)`;
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

  // Participant info
  const info = extractConversationInfo(body);
  if (info.contactNames.length > 0 || info.userEmails.length > 0) {
    const parts = [];
    if (info.contactNames.length > 0) parts.push(`Cliente: ${info.contactNames.join(', ')}`);
    if (info.userEmails.length > 0) parts.push(`Implementador: ${info.users.map(u => u.name || u.email).join(', ')}`);
    text += `\n\n👥 Participantes: ${parts.join(' | ')}`;
  }

  text += `\n\n🔗 Match: ${matchInfo.matchedBy} (${matchInfo.matchedValue})`;
  text += `\n📊 Estado: ${statusResult.reason}`;
  text += `\n— Actualización automática vía DIIO (WhatsApp)`;

  // Title: use company name if available, otherwise generic
  const titleCompany = companyFromTitle || matchInfo.matchedValue || 'WhatsApp';
  const title = `WhatsApp ${today} — ${titleCompany}`;

  const response = await asanaRequest('/status_updates', token, 'POST', {
    data: {
      parent: projectGid,
      status_type: statusResult.statusType,
      title: title,
      text: text,
    },
  });

  return response;
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

  // Strategy 3: If seller emails are available, find projects where they are owner
  if (sellerEmails?.length > 0) {
    for (const portfolioGid of PORTFOLIOS) {
      const items = await asanaRequest(
        `/portfolios/${portfolioGid}/items?opt_fields=name,completed,owner,owner.email&limit=100`,
        token
      );

      if (items?.data) {
        // This is a weaker match - log it but still return if found
        const ownerProjects = items.data.filter(
          p => !p.completed && sellerEmails.includes(p.owner?.email)
        );
        if (ownerProjects.length === 1) {
          return ownerProjects[0]; // Only return if unique match
        }
      }
    }
  }

  return null;
}

// ===== CREATE ASANA STATUS UPDATE =====
async function createStatusUpdate(projectGid, meetingData, token) {
  const tv = meetingData.tracker_values || {};
  const summary = tv.summary?.value || 'Sin resumen disponible';
  const pains = tv.customer_pains?.value;
  const objections = tv.objections?.value;
  const unresolvedQueries = tv.unresolve_queries?.value;
  const commitments = meetingData.commitments;
  // DIIO sends duration in seconds — convert to minutes
  const rawDuration = meetingData.duration;
  const duration = rawDuration ? Math.round(rawDuration / 60) : null;
  // Debug: log raw sentiment data to diagnose value mismatch
  console.log('SENTIMENT DEBUG (meeting):', JSON.stringify({
    rawSentiment: tv.sentiment,
    sentimentValue: tv.sentiment?.value,
    sentimentType: typeof tv.sentiment,
    sentimentValueType: typeof tv.sentiment?.value,
    allTrackerKeys: Object.keys(tv),
    // Check alternative key names DIIO might use
    sentimiento: tv.sentimiento,
    sentimiento_del_cliente: tv.sentimiento_del_cliente,
    'Sentimiento del cliente': tv['Sentimiento del cliente'],
  }));

  // Try multiple paths where DIIO might put the sentiment value
  const sentiment = tv.sentiment?.value
    ?? tv.sentiment  // maybe it's not nested
    ?? tv.sentimiento?.value
    ?? tv.sentimiento
    ?? tv['Sentimiento del cliente']?.value
    ?? tv['Sentimiento del cliente'];

  console.log('SENTIMENT RESOLVED:', sentiment, typeof sentiment);

  const meetingDate = meetingData.scheduled_at
    ? new Date(meetingData.scheduled_at).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('es-CL');

  // Compute smart status
  const statusResult = await computeSmartStatus(projectGid, sentiment, token);

  if (statusResult.skipped) {
    console.log(`Skipping status change for project ${projectGid}: ${statusResult.reason}`);
  }

  // Build status update text
  const meetingName = meetingData.name || '';
  let text = `📋 Resumen reunión ${meetingDate}`;
  if (duration) text += ` (${duration} min)`;
  if (meetingName) text += `\n📎 Reunión DIIO: ${meetingName}`;
  const sLabel = sentimentLabel(sentiment);
  if (sLabel) text += `\n🎯 Sentimiento del cliente: ${sLabel} (${sentiment}/5)`;
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

  text += `\n\n📊 Estado: ${statusResult.reason}`;
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
function logEvent(action, meetingName, projectName, success, details = '') {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    action,
    meetingName,
    projectMatch: projectName || 'NO MATCH',
    success,
    details,
  }));
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

  // Log every incoming webhook for debugging — include raw sentiment for diagnosis
  const _tv = body.tracker_values || {};
  console.log('DIIO webhook received:', JSON.stringify({
    action: body.action,
    id: body.id,
    integration_type: body.integration_type,
    name: body.name,
    conversation_type: body.conversation_type || body.type,
    hasTrackerValues: !!body.tracker_values,
    trackerKeys: body.tracker_values ? Object.keys(body.tracker_values) : [],
    rawSentiment: _tv.sentiment,
    rawSentimiento: _tv.sentimiento || _tv['Sentimiento del cliente'],
    hasParticipants: !!body.participants,
    participantCount: Array.isArray(body.participants) ? body.participants.length : 0,
    keys: Object.keys(body),
  }));

  // Validate signature
  if (!validateSignature(req, body)) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Detect event type:
  // 1. Meetings have action: "meeting.finished"
  // 2. Conversations may NOT have an action field — detect by integration_type + tracker_values
  const action = body.action;
  const isConversation = !action && body.integration_type && body.tracker_values;

  if (!SUPPORTED_ACTIONS.includes(action) && !isConversation) {
    logEvent(action || 'unknown', body.name || body.id, null, true,
      `Skipped - unrecognized event. Keys: ${Object.keys(body).join(', ')}`);
    return res.status(200).json({ status: 'ok', message: `Skipped event: ${action || 'unknown'}` });
  }

  try {
    // ===== MEETING FINISHED =====
    if (action === 'meeting.finished') {
      const meetingName = body.name || '';
      const companyName = extractCompanyName(meetingName);
      const sellerEmails = body.attendees?.sellers?.map(s => s.email) || [];

      logEvent(action, meetingName, null, true, `Extracted company: "${companyName}"`);

      const project = await findAsanaProject(companyName, sellerEmails, token);

      if (!project) {
        const _tv = body.tracker_values || {};
        logEvent(action, meetingName, null, false, `No project found for company: "${companyName}"`);
        return res.status(200).json({
          status: 'warning',
          message: `No matching Asana project found for "${companyName}"`,
          meetingName,
          companyExtracted: companyName,
          _debug_sentiment: {
            raw_sentiment_field: _tv.sentiment,
            raw_sentiment_type: typeof _tv.sentiment,
            resolved_value: _tv.sentiment?.value ?? _tv.sentiment ?? null,
            all_tracker_keys: Object.keys(_tv),
          },
        });
      }

      const statusUpdate = await createStatusUpdate(project.gid, body, token);

      if (statusUpdate) {
        logEvent(action, meetingName, project.name, true, 'Status update created');
        // Include raw sentiment debug info in response
        const _tv = body.tracker_values || {};
        return res.status(200).json({
          status: 'success',
          message: `Status update created on "${project.name}"`,
          projectGid: project.gid,
          statusUpdateGid: statusUpdate.data?.gid,
          _debug_sentiment: {
            raw_sentiment_field: _tv.sentiment,
            raw_sentiment_type: typeof _tv.sentiment,
            resolved_value: _tv.sentiment?.value ?? _tv.sentiment ?? null,
            all_tracker_keys: Object.keys(_tv),
          },
        });
      } else {
        logEvent(action, meetingName, project.name, false, 'Failed to create status update');
        return res.status(500).json({
          status: 'error',
          message: `Failed to create status update on "${project.name}"`,
        });
      }
    }

    // ===== WHATSAPP CONVERSATION PROCESSED =====
    // Detected by: integration_type present + tracker_values present, OR action contains 'written_conversation'
    if (isConversation || (action && action.includes('written_conversation'))) {
      const convInfo = extractConversationInfo(body);
      const convId = body.id || 'unknown';
      const convName = body.name || '';

      logEvent(action || 'conversation', convName || convId, null, true,
        `Name: "${convName}" | Contacts: [${convInfo.contactNames.join(', ')}] | Users: [${convInfo.userEmails.join(', ')}]`
      );

      const matchResult = await findAsanaProjectForConversation(
        convName, convInfo.contactNames, convInfo.userEmails, token
      );

      if (!matchResult) {
        logEvent(action, convId, null, false,
          `No project found. Contacts: [${convInfo.contactNames.join(', ')}], Users: [${convInfo.userEmails.join(', ')}]`
        );
        return res.status(200).json({
          status: 'warning',
          message: 'No matching Asana project found for WhatsApp conversation',
          conversationId: convId,
          contactNames: convInfo.contactNames,
          userEmails: convInfo.userEmails,
        });
      }

      const statusUpdate = await createConversationStatusUpdate(
        matchResult.project.gid, body, matchResult, token
      );

      if (statusUpdate) {
        logEvent(action, convId, matchResult.project.name, true,
          `Status update created (matched by ${matchResult.matchedBy}: ${matchResult.matchedValue})`
        );
        return res.status(200).json({
          status: 'success',
          message: `Status update created on "${matchResult.project.name}" from WhatsApp`,
          projectGid: matchResult.project.gid,
          statusUpdateGid: statusUpdate.data?.gid,
          matchedBy: matchResult.matchedBy,
        });
      } else {
        logEvent(action, convId, matchResult.project.name, false, 'Failed to create status update');
        return res.status(500).json({
          status: 'error',
          message: `Failed to create status update on "${matchResult.project.name}"`,
        });
      }
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    logEvent(action, body.name || body.id, null, false, error.message);
    return res.status(500).json({ error: error.message });
  }
}
