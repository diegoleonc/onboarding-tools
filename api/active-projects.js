// API endpoint to list active projects from the 3 onboarding portfolios
const ASANA_BASE = 'https://app.asana.com/api/1.0';

const PORTFOLIOS = [
  '1203602528347966', // 01 Set Up
  '1203602528347970', // 02 Upgrade
  '1203602528347974', // 03 Reonboarding
];

async function asanaRequest(path, token) {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.ASANA_PAT;
  if (!token) return res.status(500).json({ error: 'ASANA_PAT not configured' });

  try {
    const projects = [];

    // Fetch all 3 portfolios in parallel
    const portfolioResults = await Promise.all(
      PORTFOLIOS.map(gid =>
        asanaRequest(`/portfolios/${gid}/items?opt_fields=name,completed,owner,owner.name&limit=100`, token)
      )
    );

    for (const result of portfolioResults) {
      if (result?.data) {
        for (const p of result.data) {
          if (!p.completed && !projects.some(existing => existing.gid === p.gid)) {
            projects.push({
              gid: p.gid,
              name: p.name,
              owner: p.owner?.name || null,
            });
          }
        }
      }
    }

    // Sort alphabetically
    projects.sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json({ total: projects.length, projects });
  } catch (err) {
    console.error('Error fetching active projects:', err);
    return res.status(500).json({ error: err.message });
  }
}
