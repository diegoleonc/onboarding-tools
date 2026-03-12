// One-time backfill endpoint: processes a single DIIO meeting and creates Asana status update
// Only creates update if meeting is newer than the project's latest status update
// POST { meeting: {...}, dryRun: true/false }

const ASANA_BASE = 'https://app.asana.com/api/1.0';
const WORKSPACE = '592491987465948';

const PORTFOLIOS = [
  '1203602528347966', // 01 Set Up
  '1203602528347970', // 02 Upgrade
  '1203602528347974', // 03 Reonboarding
];

// ===== ASANA API HELPER =====
async function asanaRequest(path, token, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
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

// ===== EXTRACT COMPANY NAME =====
function extractCompanyName(meetingName) {
  if (!meetingName) return null;

  // Try common patterns
  const patterns = [
    /^(.+?)\s*-\s*Onboarding\s*-?\s*Multivende/i,
    /^(.+?)\s*-\s*Onboarding/i,
    /^(?:KO|Onb|onb)\s*-?\s*(.+?)(?:\s*-\s*Multivende)?$/i,
    /^(.+?)\s*-\s*(?:Pre\s*Kick\s*Off|Kick\s*Off|KO|Setup|Upgrade|API|OPS|Conexión|Configuración|Vinculación|Errores|Atributos|Activar|Tik\s*Tok|Amazon|Mercado\s*Libre|Tienda\s*Oficial)\b/i,
    /^(.+?)\s*-\s*Multivende/i,
    /^(.+?)\s*-\s*/i,
  ];

  for (const pattern of patterns) {
    const match = meetingName.match(pattern);
    if (match) {
      const name = match[1].trim();
      // Skip if it looks like a personal name pattern "X and Y"
      if (/\band\b/i.test(name) && name.split(/\s+/).length <= 5) continue;
      if (name.length >= 2) return name;
    }
  }

  // If no pattern matched, skip names that look like personal calls
  if (/\band\b/i.test(meetingName)) return null;

  return meetingName.trim() || null;
}

// ===== FIND ASANA PROJECT =====
async function findAsanaProject(companyName, sellerEmails, token) {
  if (!companyName) return null;

  // Strategy 1: Typeahead search
  const searchResults = await asanaRequest(
    `/workspaces/${WORKSPACE}/typeahead?resource_type=project&query=${encodeURIComponent(companyName)}&count=10`,
    token
  );

  if (searchResults?.data?.length > 0) {
    for (const result of searchResults.data) {
      const projectName = result.name.toLowerCase();
      const searchName = companyName.toLowerCase();
      if (projectName.includes(searchName)) {
        const project = await asanaRequest(
          `/projects/${result.gid}?opt_fields=completed,name`,
          token
        );
        if (project?.data && !project.data.completed) {
          return project.data;
        }
      }
    }
  }

  // Strategy 2: Portfolio scan
  for (const portfolioGid of PORTFOLIOS) {
    const items = await asanaRequest(
      `/portfolios/${portfolioGid}/items?opt_fields=name,completed&limit=100`,
      token
    );
    if (items?.data) {
      for (const project of items.data) {
        if (project.completed) continue;
        const pn = project.name.toLowerCase();
        const sn = companyName.toLowerCase();

        if (pn.includes(sn) || sn.includes(pn.split(' ')[0])) {
          return project;
        }
        // Fuzzy: all words match
        const words = sn.split(/\s+/).filter((w) => w.length > 2);
        if (words.length > 1 && words.every((w) => pn.includes(w))) {
          return project;
        }
      }
    }
  }

  // Strategy 3: Seller email → project owner
  if (sellerEmails?.length > 0) {
    const candidates = [];
    for (const portfolioGid of PORTFOLIOS) {
      const items = await asanaRequest(
        `/portfolios/${portfolioGid}/items?opt_fields=name,completed,owner,owner.email&limit=100`,
        token
      );
      if (items?.data) {
        const owned = items.data.filter(
          (p) => !p.completed && sellerEmails.includes(p.owner?.email)
        );
        candidates.push(...owned);
      }
    }
    if (candidates.length === 1) return candidates[0];
  }

  return null;
}

// ===== GET LATEST STATUS UPDATE DATE =====
async function getLatestStatusUpdateDate(projectGid, token) {
  const result = await asanaRequest(
    `/status_updates?parent=${projectGid}&opt_fields=created_at,title&limit=1`,
    token
  );
  if (result?.data?.length > 0) {
    return {
      date: new Date(result.data[0].created_at),
      title: result.data[0].title,
    };
  }
  return null;
}

// ===== SMART STATUS (simplified for backfill) =====
function computeBackfillStatus(sentiment, dueOn, meetingDate) {
  // Date-based
  let dateStatus = null;
  if (dueOn) {
    const due = new Date(dueOn + 'T23:59:59');
    const meeting = new Date(meetingDate);
    const daysRemaining = Math.ceil((due - meeting) / (1000 * 60 * 60 * 24));
    if (daysRemaining < 0) dateStatus = 'off_track';
    else if (daysRemaining <= 5) dateStatus = 'at_risk';
    else dateStatus = 'on_track';
  }

  // Sentiment-based
  let sentimentStatus = 'on_track';
  const val = typeof sentiment === 'string' ? parseFloat(sentiment) : sentiment;
  if (!isNaN(val) && val <= 3) sentimentStatus = 'at_risk';

  // Combine
  if (dateStatus === 'off_track') return 'off_track';
  if (dateStatus === 'at_risk') return 'at_risk';
  return sentimentStatus;
}

// ===== MAIN HANDLER =====
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const token = process.env.ASANA_PAT;
  if (!token) {
    return res.status(500).json({ error: 'ASANA_PAT not configured' });
  }

  const { meeting, dryRun = true } = req.body;
  if (!meeting) {
    return res.status(400).json({ error: 'Missing meeting data' });
  }

  const meetingName = meeting['Nombre'] || '';
  const meetingDate = meeting['Fecha de agendado'] || '';
  const sentiment = meeting['Sentimiento del cliente'];
  const duration = meeting['Duración'];
  const pains = meeting['Dolores del cliente'];
  const objections = meeting['Objeciones'];
  const pendingTopics = meeting['Temas pendientes'];
  const keyNotes = meeting['Apuntes clave'];
  const followUpEmail = meeting['Mail de seguimiento'];
  const nextSteps = meeting['Recomendaciones de Próximos pasos'];
  const participants = meeting.participants || [];

  // Extract company name
  const companyName = extractCompanyName(meetingName);
  if (!companyName) {
    return res.status(200).json({
      status: 'skipped',
      reason: 'Could not extract company name',
      meetingName,
      meetingDate,
    });
  }

  // Get seller emails
  const sellerEmails = participants
    .filter((p) => p['Rol de participante'] === 'seller')
    .map((p) => p['Email del participante'])
    .filter(Boolean);

  // Find Asana project
  const project = await findAsanaProject(companyName, sellerEmails, token);
  if (!project) {
    return res.status(200).json({
      status: 'skipped',
      reason: 'No matching Asana project found',
      companyName,
      meetingName,
      meetingDate,
    });
  }

  // Check latest status update date
  const latestUpdate = await getLatestStatusUpdateDate(project.gid, token);
  const meetingDateObj = new Date(meetingDate);

  if (latestUpdate && meetingDateObj <= latestUpdate.date) {
    return res.status(200).json({
      status: 'skipped',
      reason: `Meeting is older than latest update (${latestUpdate.title} — ${latestUpdate.date.toISOString()})`,
      companyName,
      projectName: project.name,
      meetingDate,
      latestUpdateDate: latestUpdate.date.toISOString(),
    });
  }

  // Get project due date for smart status
  const projectDetails = await asanaRequest(
    `/projects/${project.gid}?opt_fields=due_on`,
    token
  );
  const dueOn = projectDetails?.data?.due_on;

  // Compute status
  const statusType = computeBackfillStatus(sentiment, dueOn, meetingDate);

  // Format date
  const dateStr = new Date(meetingDate).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Build status update text
  let text = `📋 Resumen reunión ${dateStr}`;
  if (duration) text += ` (${Math.round(duration / 60)} min)`;
  text += `\n\n${keyNotes || 'Sin resumen disponible'}`;

  if (pains) text += `\n\n🔴 Dolores del cliente:\n${pains}`;
  if (objections) text += `\n\n⚠️ Objeciones:\n${objections}`;
  if (pendingTopics) text += `\n\n❓ Temas pendientes:\n${pendingTopics}`;
  if (nextSteps) text += `\n\n📌 Próximos pasos:\n${nextSteps}`;

  // Participants
  const sellers = participants.filter((p) => p['Rol de participante'] === 'seller').map((p) => p['Nombre de participante']);
  const customers = participants.filter((p) => p['Rol de participante'] === 'customer').map((p) => p['Nombre de participante']);
  if (sellers.length || customers.length) {
    const parts = [];
    if (sellers.length) parts.push(sellers.join(', '));
    if (customers.length) parts.push(customers.join(', '));
    text += `\n\n👥 Participantes: ${parts.join(' | ')}`;
  }

  text += `\n\n📊 Sentiment: ${sentiment}/5`;
  text += `\n— Backfill histórico vía DIIO`;

  if (dryRun) {
    return res.status(200).json({
      status: 'dry_run',
      wouldCreate: true,
      companyName,
      projectName: project.name,
      projectGid: project.gid,
      meetingDate,
      statusType,
      title: `Reunión ${dateStr} — Resumen DIIO`,
      textPreview: text.substring(0, 300) + '...',
      latestUpdateDate: latestUpdate?.date?.toISOString() || null,
    });
  }

  // Create status update
  const response = await asanaRequest('/status_updates', token, 'POST', {
    data: {
      parent: project.gid,
      status_type: statusType,
      title: `Reunión ${dateStr} — Resumen DIIO`,
      text: text,
      created_at: meetingDate, // Backdate to meeting time
    },
  });

  if (response) {
    return res.status(200).json({
      status: 'created',
      companyName,
      projectName: project.name,
      projectGid: project.gid,
      meetingDate,
      statusType,
      statusUpdateGid: response.data?.gid,
    });
  } else {
    return res.status(500).json({
      status: 'error',
      reason: 'Failed to create status update',
      companyName,
      projectName: project.name,
    });
  }
}
