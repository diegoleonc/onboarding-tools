// Vercel Serverless Function: Calculate effort metrics per project
// Reads status updates from Asana to compute meetings, conversations, and time spent
const ASANA_BASE = 'https://app.asana.com/api/1.0';

const PORTFOLIOS = [
  '1203602528347966', // 01 Set Up
  '1203602528347970', // 02 Upgrade
  '1203602528347974', // 03 Reonboarding
];

async function asanaRequest(path, token) {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Asana API error ${res.status} on ${path}:`, err);
    return null;
  }

  return res.json();
}

async function getProjectsFromPortfolios(token) {
  const allProjects = [];

  for (const portfolioGid of PORTFOLIOS) {
    let offset = null;
    do {
      const url = `/portfolios/${portfolioGid}/items?opt_fields=name,completed,completed_at,owner,owner.name,start_on,due_on,created_at,permalink_url&limit=100${offset ? `&offset=${offset}` : ''}`;
      const result = await asanaRequest(url, token);
      if (result?.data) {
        allProjects.push(...result.data);
      }
      offset = result?.next_page?.offset || null;
    } while (offset);
  }

  return allProjects;
}

async function getStatusUpdatesForProject(projectGid, token) {
  const updates = [];
  let offset = null;

  do {
    const url = `/status_updates?parent=${projectGid}&opt_fields=title,text,status_type,created_at&limit=100${offset ? `&offset=${offset}` : ''}`;
    const result = await asanaRequest(url, token);
    if (result?.data) {
      updates.push(...result.data);
    }
    offset = result?.next_page?.offset || null;
  } while (offset);

  return updates;
}

function parseMetricsFromUpdates(updates) {
  let meetings = 0;
  let conversations = 0;
  let totalMinutes = 0;
  const meetingDates = [];
  const conversationDates = [];

  for (const update of updates) {
    const title = update.title || '';
    const text = update.text || '';
    const createdAt = update.created_at;

    // Detect meetings: title contains "Reunión" or text starts with "📋 Resumen reunión"
    if (title.includes('Reunión') || text.includes('Resumen reunión')) {
      meetings++;
      if (createdAt) meetingDates.push(createdAt);

      // Extract duration from text: "(XX min)"
      const durationMatch = text.match(/\((\d+)\s*min\)/);
      if (durationMatch) {
        totalMinutes += parseInt(durationMatch[1]);
      }
    }
    // Detect conversations: title contains "WhatsApp" or text starts with "💬"
    else if (title.includes('WhatsApp') || text.includes('Resumen conversación WhatsApp')) {
      conversations++;
      if (createdAt) conversationDates.push(createdAt);
    }
  }

  return {
    meetings,
    conversations,
    totalUpdates: meetings + conversations,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10, // 1 decimal
    meetingDates,
    conversationDates,
    firstActivity: [...meetingDates, ...conversationDates].sort()[0] || null,
    lastActivity: [...meetingDates, ...conversationDates].sort().pop() || null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const token = process.env.ASANA_PAT;
  if (!token) {
    return res.status(500).json({ error: 'ASANA_PAT not configured' });
  }

  // Optional: fetch metrics for a single project
  const { projectGid } = req.query;

  try {
    if (projectGid) {
      // Single project mode
      const updates = await getStatusUpdatesForProject(projectGid, token);
      const metrics = parseMetricsFromUpdates(updates);
      return res.status(200).json({ projectGid, ...metrics });
    }

    // All projects mode: fetch all projects then their status updates
    const projects = await getProjectsFromPortfolios(token);

    // Process in batches to avoid overwhelming Asana API
    const results = [];

    for (const project of projects) {
      const updates = await getStatusUpdatesForProject(project.gid, token);
      const metrics = parseMetricsFromUpdates(updates);

      // Calculate calendar days
      const start = project.start_on || project.created_at?.split('T')[0];
      let calendarDays = null;
      if (start) {
        const startDate = new Date(start);
        const endDate = project.completed_at ? new Date(project.completed_at) : new Date();
        calendarDays = Math.max(0, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
      }

      results.push({
        gid: project.gid,
        name: project.name,
        owner: project.owner?.name || 'Sin asignar',
        completed: project.completed || false,
        completedAt: project.completed_at || null,
        startOn: project.start_on || null,
        dueOn: project.due_on || null,
        permalink: project.permalink_url,
        calendarDays,
        ...metrics,
      });
    }

    // Sort by total hours descending
    results.sort((a, b) => b.totalHours - a.totalHours);

    // Compute global totals
    const totals = results.reduce((acc, r) => ({
      meetings: acc.meetings + r.meetings,
      conversations: acc.conversations + r.conversations,
      totalMinutes: acc.totalMinutes + r.totalMinutes,
      totalHours: Math.round((acc.totalMinutes + r.totalMinutes) / 60 * 10) / 10,
      projectsWithActivity: acc.projectsWithActivity + (r.totalUpdates > 0 ? 1 : 0),
    }), { meetings: 0, conversations: 0, totalMinutes: 0, totalHours: 0, projectsWithActivity: 0 });

    return res.status(200).json({
      projects: results,
      totals,
      meta: {
        totalProjects: results.length,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Metrics API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
