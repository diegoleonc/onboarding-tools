const ASANA_BASE = 'https://app.asana.com/api/1.0';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pat = process.env.ASANA_PAT;
  if (!pat) {
    return res.status(500).json({ error: 'ASANA_PAT not configured' });
  }

  const { projectGid, sectionName } = req.body;
  if (!projectGid || !sectionName) {
    return res.status(400).json({ error: 'Missing projectGid or sectionName' });
  }

  try {
    const response = await fetch(`${ASANA_BASE}/projects/${projectGid}/sections`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { name: sectionName } }),
    });

    const data = await response.json();

    if (data.errors) {
      return res.status(400).json({ error: data.errors[0]?.message || 'Asana API error' });
    }

    return res.status(200).json({
      gid: data.data.gid,
      name: data.data.name,
    });
  } catch (err) {
    console.error('Asana section creation error:', err);
    return res.status(500).json({ error: 'Failed to create section' });
  }
}
