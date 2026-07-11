// Asana API client — calls our Vercel serverless functions

export async function fetchPortfolioProjects(type) {
  const res = await fetch(`/api/asana/portfolio-projects?type=${encodeURIComponent(type)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Error obteniendo proyectos del portfolio');
  }
  return res.json();
}

export async function searchProjects(query) {
  const res = await fetch(`/api/asana/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Error buscando proyectos');
  }
  const data = await res.json();
  return data.projects;
}

export async function createSection(projectGid, sectionName) {
  const res = await fetch('/api/asana/sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectGid, sectionName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error creando sección "${sectionName}"`);
  }
  return res.json();
}

export async function createTask(projectGid, sectionGid, taskName, dueOn) {
  const res = await fetch('/api/asana/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectGid, sectionGid, taskName, dueOn }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error creando tarea "${taskName}"`);
  }
  return res.json();
}

/**
 * Send all generated tasks to an Asana project.
 * Creates sections first, then tasks within each section.
 * Calls onProgress(current, total, message) for UI updates.
 */
export async function sendTasksToAsana(projectGid, tasks, onProgress) {
  // Group tasks by section
  const sectionMap = new Map();
  for (const task of tasks) {
    if (!sectionMap.has(task.section)) {
      sectionMap.set(task.section, []);
    }
    sectionMap.get(task.section).push(task);
  }

  const totalSteps = sectionMap.size + tasks.length;
  let currentStep = 0;

  const sectionGids = new Map();

  // 1. Create all sections
  for (const sectionName of sectionMap.keys()) {
    onProgress?.(currentStep, totalSteps, `Creando sección: ${sectionName}`);
    try {
      const section = await createSection(projectGid, sectionName);
      sectionGids.set(sectionName, section.gid);
    } catch (err) {
      throw new Error(`Error en sección "${sectionName}": ${err.message}`);
    }
    currentStep++;
  }

  // 2. Create all tasks within their sections
  const results = { created: 0, errors: [] };

  for (const [sectionName, sectionTasks] of sectionMap) {
    const sectionGid = sectionGids.get(sectionName);

    for (const task of sectionTasks) {
      onProgress?.(currentStep, totalSteps, `Creando tarea: ${task.task}`);
      try {
        await createTask(projectGid, sectionGid, task.task, task.date);
        results.created++;
      } catch (err) {
        results.errors.push({ task: task.task, error: err.message });
      }
      currentStep++;
    }
  }

  return results;
}
