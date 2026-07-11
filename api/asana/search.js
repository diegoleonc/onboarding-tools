const ASANA_BASE = 'https://app.asana.com/api/1.0';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pat = process.env.ASANA_PAT;
  if (!pat) {
    return res.status(500).json({ error: 'ASANA_PAT not configured' });
  }

  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter "q"' });
  }

  try {
    // First get the workspace GID
    const wsRes = await fetch(`${ASANA_BASE}/workspaces`, {
      headers: { Authorization: `Bearer ${pat}` },
    });
    const wsData = await wsRes.json();
    if (!wsData.data?.length) {
      return res.status(404).json({ error: 'No workspaces found' });
    }
    const workspaceGid = wsData.data[0].gid;

    // Search projects using typeahead
    const searchRes = await fetch(
      `${ASANA_BASE}/workspaces/${workspaceGid}/typeahead?resource_type=project&query=${encodeURIComponent(query)}&count=10`,
      { headers: { Authorization: `Bearer ${pat}` } }
    );
    const searchData = await searchRes.json();

    return res.status(200).json({
      projects: (searchData.data || []).map((p) => ({
        gid: p.gid,
        name: p.name,
      })),
    });
  } catch (err) {
    console.error('Asana search error:', err);
    return res.status(500).json({ error: 'Failed to search Asana projects' });
  }
}
