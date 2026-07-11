const ASANA_BASE = 'https://app.asana.com/api/1.0';

// Hardcoded portfolio GIDs — stable Asana IDs
const PORTFOLIOS = {
  setup: '1203602528347966',
  upgrade: '1203602528347970',
  reonboarding: '1203602528347974',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pat = process.env.ASANA_PAT;
  if (!pat) {
    return res.status(500).json({ error: 'ASANA_PAT not configured' });
  }

  const type = req.query.type; // setup | upgrade | reonboarding
  if (!type || !PORTFOLIOS[type]) {
    return res.status(400).json({
      error: 'Missing or invalid "type" parameter. Use: setup, upgrade, reonboarding',
    });
  }

  const portfolioGid = PORTFOLIOS[type];
  const headers = { Authorization: `Bearer ${pat}` };

  try {
    // 1. Get ALL projects in the portfolio (paginated), including archived status
    let allProjects = [];
    let offset = null;

    do {
      const url = new URL(`${ASANA_BASE}/portfolios/${portfolioGid}/items`);
      url.searchParams.set('opt_fields', 'name,permalink_url,archived,completed');
      url.searchParams.set('limit', '100');
      if (offset) url.searchParams.set('offset', offset);

      const resp = await fetch(url.toString(), { headers });
      const data = await resp.json();

      if (data.data) {
        allProjects = allProjects.concat(data.data);
      }

      offset = data.next_page?.offset || null;
    } while (offset);

    // 2. Filter out archived AND completed/finished projects BEFORE checking tasks
    const activeProjects = allProjects.filter((p) => !p.archived && !p.completed);

    // 3. Check each active project for tasks (in parallel, batches of 10)
    const results = [];
    const batchSize = 10;

    for (let i = 0; i < activeProjects.length; i += batchSize) {
      const batch = activeProjects.slice(i, i + batchSize);

      const checks = await Promise.all(
        batch.map(async (project) => {
          try {
            const taskResp = await fetch(
              `${ASANA_BASE}/projects/${project.gid}/tasks?limit=1&opt_fields=gid`,
              { headers }
            );
            const taskData = await taskResp.json();
            const hasTasks = taskData.data && taskData.data.length > 0;
            return {
              gid: project.gid,
              name: project.name,
              url: project.permalink_url,
              hasTasks,
            };
          } catch {
            return {
              gid: project.gid,
              name: project.name,
              url: project.permalink_url,
              hasTasks: null, // unknown
            };
          }
        })
      );

      results.push(...checks);
    }

    // 4. Return only unparametrized projects (no tasks)
    const unparametrized = results.filter((p) => p.hasTasks === false);

    return res.status(200).json({
      portfolio: type,
      total: allProjects.length,
      active: activeProjects.length,
      unparametrized: unparametrized.length,
      projects: unparametrized,
    });
  } catch (err) {
    console.error('Portfolio projects error:', err);
    return res.status(500).json({ error: 'Failed to fetch portfolio projects' });
  }
}
