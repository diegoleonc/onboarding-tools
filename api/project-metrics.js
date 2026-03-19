// Vercel Serverless Function: Calculate effort metrics per project
// Reads status updates from Asana to compute meetings and time spent
export const config = {
  maxDuration: 60, // Allow up to 60 seconds (Vercel Pro/Hobby limit)
};

const ASANA_BASE = 'https://app.asana.com/api/1.0';

const PORTFOLIOS = [
  '1203602528347966', // 01 Set Up
  '1203602528347970', // 02 Upgrade
  '1203602528347974', // 03 Reonboarding
];

const CONCURRENCY = 10; // Max parallel Asana API calls

async function asanaRequest(path, token) {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    // Rate limit: wait and retry once
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '2') * 1000;
      console.log(`Rate limited on ${path}, retrying in ${retryAfter}ms`);
      await new Promise(r => setTimeout(r, retryAfter));
      const retry = await fetch(`${ASANA_BASE}${path}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (retry.ok) return retry.json();
    }
    const err = await res.text();
    console.error(`Asana API error ${res.status} on ${path}:`, err);
    return null;
  }

  return res.json();
}

// Process items in parallel with concurrency limit
async function parallelMap(items, fn, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function getProjectsFromPortfolios(token) {
  // Fetch all 3 portfolios in parallel
  const portfolioResults = await Promise.all(
    PORTFOLIOS.map(async (portfolioGid) => {
      const allItems = [];
      let offset = null;
      do {
        const url = `/portfolios/${portfolioGid}/items?opt_fields=name,completed,completed_at,owner,owner.name,start_on,due_on,created_at,permalink_url,current_status_update,current_status_update.status_type&limit=100${offset ? `&offset=${offset}` : ''}`;
        const result = await asanaRequest(url, token);
        if (result?.data) allItems.push(...result.data);
        offset = result?.next_page?.offset || null;
      } while (offset);
      return allItems;
    })
  );

  // Deduplicate projects that appear in multiple portfolios
  const seen = new Set();
  const unique = [];
  for (const p of portfolioResults.flat()) {
    if (!seen.has(p.gid)) {
      seen.add(p.gid);
      unique.push(p);
    }
  }
  return unique;
}

async function getStatusUpdatesForProject(projectGid, token) {
  // Only fetch first page — most projects won't have >100 DIIO updates
  const url = `/status_updates?parent=${projectGid}&opt_fields=title,text,status_type,created_at&limit=100`;
  const result = await asanaRequest(url, token);
  return result?.data || [];
}

function parseMetricsFromUpdates(updates) {
  const meetingDetails = [];

  for (const update of updates) {
    const title = update.title || '';
    const text = update.text || '';
    const createdAt = update.created_at;

    // Only count DIIO-generated meetings (our webhook always adds this signature)
    const isDiioUpdate = text.includes('Actualización automática vía DIIO');
    if (isDiioUpdate && (title.includes('Reunión') || title.includes('Reunion') || text.includes('Resumen reunión'))) {
      let minutes = 0;
      const durationMatch = text.match(/\((\d+)\s*min\)/);
      if (durationMatch) minutes = parseInt(durationMatch[1]);

      meetingDetails.push({ date: createdAt, minutes });
    }
  }

  const meetings = meetingDetails.length;
  const totalMinutes = meetingDetails.reduce((sum, m) => sum + m.minutes, 0);
  const sortedDates = meetingDetails.map(m => m.date).filter(Boolean).sort();
  const lastMeeting = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;
  const daysSinceLastMeeting = lastMeeting
    ? Math.floor((Date.now() - new Date(lastMeeting).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    meetings,
    totalUpdates: meetings,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    firstActivity: sortedDates[0] || null,
    lastActivity: lastMeeting,
    daysSinceLastMeeting,
    meetingDetails, // Array of { date, minutes } for frontend week filtering
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');

  const token = process.env.ASANA_PAT;
  if (!token) {
    return res.status(500).json({ error: 'ASANA_PAT not configured' });
  }

  const { projectGid } = req.query;

  try {
    if (projectGid) {
      const updates = await getStatusUpdatesForProject(projectGid, token);
      const metrics = parseMetricsFromUpdates(updates);
      return res.status(200).json({ projectGid, ...metrics });
    }

    // Fetch all projects from portfolios (parallel)
    const projects = await getProjectsFromPortfolios(token);

    console.log(`Fetching metrics for ${projects.length} projects (concurrency: ${CONCURRENCY})`);

    // Fetch status updates for all projects in parallel with concurrency limit
    const results = await parallelMap(projects, async (project) => {
      const updates = await getStatusUpdatesForProject(project.gid, token);
      const metrics = parseMetricsFromUpdates(updates);

      const start = project.start_on || project.created_at?.split('T')[0];
      let calendarDays = null;
      if (start) {
        const startDate = new Date(start);
        const endDate = project.completed_at ? new Date(project.completed_at) : new Date();
        calendarDays = Math.max(0, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
      }

      return {
        gid: project.gid,
        name: project.name,
        owner: project.owner?.name || 'Sin asignar',
        completed: project.completed || false,
        completedAt: project.completed_at || null,
        startOn: project.start_on || null,
        dueOn: project.due_on || null,
        permalink: project.permalink_url,
        statusType: project.current_status_update?.status_type || null,
        calendarDays,
        ...metrics,
      };
    }, CONCURRENCY);

    // Sort by total hours descending
    results.sort((a, b) => b.totalHours - a.totalHours);

    // Compute global totals
    const totals = results.reduce((acc, r) => {
      const isActive = !r.completed;
      const isNeglected = isActive && (r.daysSinceLastMeeting === null || r.daysSinceLastMeeting > 7);
      return {
        meetings: acc.meetings + r.meetings,
        totalMinutes: acc.totalMinutes + r.totalMinutes,
        totalHours: Math.round((acc.totalMinutes + r.totalMinutes) / 60 * 10) / 10,
        projectsWithActivity: acc.projectsWithActivity + (r.totalUpdates > 0 ? 1 : 0),
        neglectedProjects: acc.neglectedProjects + (isNeglected ? 1 : 0),
        activeProjects: acc.activeProjects + (isActive ? 1 : 0),
      };
    }, { meetings: 0, totalMinutes: 0, totalHours: 0, projectsWithActivity: 0, neglectedProjects: 0, activeProjects: 0 });

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
