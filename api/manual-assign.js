// API endpoint to manually assign an unmatched meeting log to an Asana project
import { Redis } from '@upstash/redis';

const ASANA_BASE = 'https://app.asana.com/api/1.0';

// Same status logic as webhook handler
const MANUAL_ONLY_STATUSES = ['complete'];

function computeSuccessStatus(successOdds) {
  if (successOdds === undefined || successOdds === null) return 'on_track';
  const val = typeof successOdds === 'string' ? parseFloat(successOdds) : successOdds;
  if (isNaN(val)) return 'on_track';
  if (val <= 2) return 'at_risk';
  return 'on_track';
}

function successOddsLabel(odds) {
  if (odds === undefined || odds === null) return '';
  const val = typeof odds === 'string' ? parseFloat(odds) : odds;
  if (isNaN(val)) return '';
  const labels = { 1: '🔴 Muy baja', 2: '🟠 Baja', 3: '🟡 Media', 4: '🟢 Alta', 5: '🟢 Muy alta' };
  return labels[val] || `Predicción: ${val}`;
}

function sentimentLabel(sentiment) {
  if (sentiment === undefined || sentiment === null) return '';
  const val = typeof sentiment === 'string' ? parseFloat(sentiment) : sentiment;
  if (isNaN(val)) return '';
  const labels = { 1: '😟 Negativo', 2: '😐 Neutral', 3: '😊 Positivo' };
  return labels[val] || `Sentiment: ${val}`;
}

async function asanaRequest(path, token, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${ASANA_BASE}${path}`, options);
  if (!res.ok) {
    const err = await res.text();
    console.error(`Asana API error ${res.status}:`, err);
    return null;
  }
  return res.json();
}

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.ASANA_PAT;
  if (!token) return res.status(500).json({ error: 'ASANA_PAT not configured' });

  const { logId, projectGid } = req.body;
  if (!logId || !projectGid) {
    return res.status(400).json({ error: 'logId and projectGid are required' });
  }

  const redis = getRedis();
  if (!redis) return res.status(500).json({ error: 'Redis not configured' });

  try {
    // Find the log entry in Redis
    const rawLogs = await redis.zrange('webhook:logs', 0, -1, { rev: true });
    let logEntry = null;
    let logMember = null;

    for (const entry of rawLogs) {
      const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry;
      if (parsed.id === logId) {
        logEntry = parsed;
        logMember = entry;
        break;
      }
    }

    if (!logEntry) {
      return res.status(404).json({ error: 'Log entry not found' });
    }

    // Get project details from Asana
    const projectData = await asanaRequest(`/projects/${projectGid}?opt_fields=name,current_status_update,current_status_update.status_type,due_on`, token);
    if (!projectData?.data) {
      return res.status(404).json({ error: 'Asana project not found' });
    }

    const project = projectData.data;
    const currentStatus = project.current_status_update?.status_type;

    // Check if project is completed (don't override)
    if (MANUAL_ONLY_STATUSES.includes(currentStatus)) {
      return res.status(400).json({ error: `Project status "${currentStatus}" cannot be overridden` });
    }

    // Compute status from success_odds
    const successOdds = logEntry.successOdds;
    const sentiment = logEntry.sentiment;
    let statusType = computeSuccessStatus(successOdds);

    // Check due date override
    if (project.due_on) {
      const now = new Date();
      const due = new Date(project.due_on + 'T23:59:59');
      const daysRemaining = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      if (daysRemaining < 0) statusType = 'off_track';
      else if (daysRemaining <= 5 && statusType === 'on_track') statusType = 'at_risk';
    }

    // Build status update text
    const today = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    let text = `📋 Resumen reunión — ${today}`;
    if (logEntry.name) text += `\n📎 Reunión DIIO: ${logEntry.name}`;
    const soLabel = successOddsLabel(successOdds);
    if (soLabel) text += `\n🎯 Predicción de éxito: ${soLabel} (${successOdds}/5)`;
    const sLabel = sentimentLabel(sentiment);
    if (sLabel) text += `\n💬 Sentimiento del cliente: ${sLabel} (${sentiment}/3)`;
    text += `\n\n(Asignación manual desde Webhook Logs)`;
    text += `\n— Actualización automática vía DIIO`;

    // Create status update in Asana
    const statusUpdate = await asanaRequest('/status_updates', token, 'POST', {
      data: {
        parent: projectGid,
        status_type: statusType,
        title: `Reunión ${today} — Resumen DIIO`,
        text: text,
      },
    });

    if (!statusUpdate) {
      return res.status(500).json({ error: 'Failed to create status update in Asana' });
    }

    // Update the log entry in Redis to reflect the manual assignment
    const updatedEntry = {
      ...logEntry,
      projectMatch: project.name,
      success: true,
      details: `Manually assigned to "${project.name}"`,
      manuallyAssigned: true,
    };

    // Remove old entry and add updated one
    if (logMember) {
      await redis.zrem('webhook:logs', logMember);
    }
    const score = new Date(logEntry.timestamp).getTime();
    await redis.zadd('webhook:logs', { score, member: JSON.stringify(updatedEntry) });

    return res.status(200).json({
      status: 'success',
      message: `Status update created on "${project.name}"`,
      projectGid,
      projectName: project.name,
      statusUpdateGid: statusUpdate.data?.gid,
      statusType,
    });
  } catch (err) {
    console.error('Manual assign error:', err);
    return res.status(500).json({ error: err.message });
  }
}
