const ASANA_BASE = 'https://app.asana.com/api/1.0';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pat = process.env.ASANA_PAT;
  if (!pat) {
    return res.status(500).json({ error: 'ASANA_PAT not configured' });
  }

  const { action, projectGid, sectionGid, taskName, dueOn } = req.body;

  // Branch: set the PROJECT's start/due dates (feedback loop del Parametrizador —
  // sin esto la calibración futura mide desde created_at y se sesga)
  if (action === 'updateProject') {
    const { startOn, dueOn: projectDueOn } = req.body;
    if (!projectGid || (!startOn && !projectDueOn)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
      const payload = {};
      if (startOn) payload.start_on = startOn;
      if (projectDueOn) payload.due_on = projectDueOn;
      const response = await fetch(`${ASANA_BASE}/projects/${projectGid}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${pat}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: payload }),
      });
      const data = await response.json();
      if (data.errors) {
        return res.status(400).json({ error: data.errors[0]?.message || 'Asana API error' });
      }
      return res.status(200).json({ gid: data.data.gid, start_on: data.data.start_on, due_on: data.data.due_on });
    } catch (err) {
      console.error('Asana project update error:', err);
      return res.status(500).json({ error: 'Failed to update project dates' });
    }
  }

  if (!projectGid || !sectionGid || !taskName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const taskData = {
      name: taskName,
      projects: [projectGid],
      memberships: [{ project: projectGid, section: sectionGid }],
    };

    if (dueOn) {
      taskData.due_on = dueOn;
    }

    const response = await fetch(`${ASANA_BASE}/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: taskData }),
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
    console.error('Asana task creation error:', err);
    return res.status(500).json({ error: 'Failed to create task' });
  }
}
