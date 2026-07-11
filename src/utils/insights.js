// ============================================================
// Insight engine — turns raw project + effort data into the
// prioritized signals the command center runs on.
// ============================================================
import { statusOf } from '../theme'
import { calculateEstimation, addBusinessDays } from './parsing'

const DAY = 24 * 60 * 60 * 1000

// Días hábiles entre dos fechas (misma semántica que el motor de calibración:
// la calibración se ajustó en días HÁBILES, nunca comparar contra días calendario)
export function businessDaysBetween(from, to) {
  const start = new Date(from)
  const end = new Date(to)
  if (end < start) return 0
  let days = 0
  const cur = new Date(start)
  while (cur < end) {
    cur.setDate(cur.getDate() + 1)
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) days++
  }
  return days
}

// ---------- week helpers ----------
export function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const yearStart = new Date(d.getFullYear(), 0, 4)
  return Math.round(((d - yearStart) / DAY + ((yearStart.getDay() + 6) % 7)) / 7) + 1
}

export function getWeekRange(year, week) {
  const jan4 = new Date(year, 0, 4)
  const dayOfWeek = jan4.getDay() || 7
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { monday, sunday }
}

export function lastNWeeks(n) {
  const now = new Date()
  const weeks = []
  const cursor = new Date(now)
  for (let i = 0; i < n; i++) {
    const week = getISOWeek(cursor)
    const year = cursor.getFullYear()
    const { monday, sunday } = getWeekRange(year, week)
    weeks.unshift({
      key: `${year}-W${String(week).padStart(2, '0')}`,
      week, year, monday, sunday,
      label: `S${week}`,
      fullLabel: `Sem ${week} (${fmtShort(monday)} – ${fmtShort(sunday)})`,
      isCurrent: i === 0,
    })
    cursor.setDate(cursor.getDate() - 7)
  }
  return weeks
}

export function fmtShort(date) {
  return new Date(date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export function inRange(dateStr, from, to) {
  if (!dateStr) return false
  const t = new Date(dateStr).getTime()
  return t >= from.getTime() && t <= to.getTime()
}

export function formatHours(hours) {
  if (!hours || hours <= 0) return '0h'
  if (hours < 1) return `${Math.round(hours * 60)}m`
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function daysSinceLabel(days) {
  if (days === null || days === undefined) return 'Sin reuniones'
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  return `Hace ${days}d`
}

export function percentile(arr, p) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((sorted.length * p) / 100) - 1
  return sorted[Math.max(0, idx)]
}

// ---------- attention engine ----------
// Scores every active project on operational risk; returns sorted list
// with human-readable reasons. This is what the COO sees first.
export function buildAttention(projects, { calibration } = {}) {
  const items = []
  const freshDays = (reading) => reading?.date ? Math.floor((Date.now() - new Date(reading.date)) / DAY) : null
  for (const p of projects) {
    if (p.completed) continue
    const st = statusOf(p)
    if (st === 'complete') continue
    let score = 0
    const reasons = []

    if (st === 'off_track') { score += 30; reasons.push({ text: 'Atrasado', kind: 'off_track' }) }
    else if (st === 'at_risk') { score += 20; reasons.push({ text: 'En riesgo', kind: 'at_risk' }) }

    // Punto ciego del semáforo: sin status update real, o con uno viejo, los KPIs
    // de riesgo "mejoran" en silencio cuando el equipo deja de actualizar Asana
    if (!p.statusType && st !== 'on_hold') {
      score += 12; reasons.push({ text: 'Sin estado en Asana', kind: 'stale' })
    } else if ((p.statusAgeDays ?? 0) > 14 && st !== 'on_hold') {
      score += 10; reasons.push({ text: `Estado sin actualizar hace ${p.statusAgeDays}d`, kind: 'stale' })
    }

    const d = p.daysSinceLastMeeting
    if (p.hasMetrics) {
      if (d === null || d === undefined) {
        if ((p.days ?? 0) > 7 && st !== 'on_hold') { score += 18; reasons.push({ text: 'Nunca ha tenido reunión', kind: 'meeting' }) }
      } else if (d > 21 && st !== 'on_hold') { score += 22; reasons.push({ text: `${d} días sin reunión`, kind: 'meeting' }) }
      else if (d > 14 && st !== 'on_hold') { score += 15; reasons.push({ text: `${d} días sin reunión`, kind: 'meeting' }) }
      else if (d > 7 && st !== 'on_hold') { score += 8; reasons.push({ text: `${d} días sin reunión`, kind: 'meeting' }) }
    }

    // Voz del cliente (DIIO). El sentimiento hoy no influye en nada; la predicción
    // de éxito ya fluye al status_type, así que solo suma cuando el semáforo la
    // contradice (p.ej. la implementadora lo volvió a poner verde a mano)
    const sentAge = freshDays(p.lastSentiment)
    if (p.lastSentiment?.value <= 1 && sentAge !== null && sentAge <= 21 && st !== 'on_hold') {
      score += 15; reasons.push({ text: `Sentimiento bajo del cliente (${p.lastSentiment.value}/3)`, kind: 'client' })
    }
    const oddsAge = freshDays(p.lastSuccessOdds)
    if (p.lastSuccessOdds?.value <= 2 && oddsAge !== null && oddsAge <= 21 && st === 'on_track') {
      score += 15; reasons.push({ text: `Predicción ${p.lastSuccessOdds.value}/5 con estado verde`, kind: 'client' })
    }

    if (p.end) {
      const overdue = Math.floor((Date.now() - new Date(p.end).getTime()) / DAY)
      if (overdue > 0) { score += Math.min(25, 10 + overdue / 3); reasons.push({ text: `Vencido hace ${overdue}d`, kind: 'due' }) }
    }

    // Vara calibrada: superar el P80 de proyectos comparables es señal dura
    if (calibration && st !== 'on_hold') {
      const a = calibratedAssessment(p, calibration)
      if (a?.bucket === 'overP80') {
        score += 20; reasons.push({ text: `${a.elapsed}d hábiles vs ${a.expected}d de plan (P80 superado)`, kind: 'plan' })
      } else if (a?.bucket === 'over') {
        score += 10; reasons.push({ text: `+${a.overPct}% sobre plan calibrado`, kind: 'plan' })
      }
    }

    if ((p.days ?? 0) > 120 && st !== 'on_hold') { score += 6; reasons.push({ text: `${p.days} días abierto`, kind: 'age' }) }

    if (score > 0 && reasons.length > 0) {
      items.push({ project: p, score: Math.round(score), reasons, status: st })
    }
  }
  return items.sort((a, b) => b.score - a.score)
}

// ---------- weekly coverage ----------
// For each of the last N weeks: of the projects active that week,
// how many had at least one DIIO meeting.
export function weeklyCoverage(projects, weeks) {
  return weeks.map(w => {
    const activeThisWeek = projects.filter(p => {
      const created = p.start || p.startOn || p.createdAt?.split('T')[0] || p.firstActivity
      if (created && new Date(created) > w.sunday) return false
      if (p.completed && p.completedAt && new Date(p.completedAt) < w.monday) return false
      if (!created && p.completed) return false
      return true
    })
    const withMeeting = activeThisWeek.filter(p =>
      p.meetingDetails?.some(m => inRange(m.date, w.monday, w.sunday))
    ).length
    const total = activeThisWeek.length
    return {
      semana: w.label,
      fullLabel: w.fullLabel,
      conReunion: withMeeting,
      sinReunion: Math.max(0, total - withMeeting),
      total,
      pct: total > 0 ? Math.round((withMeeting / total) * 100) : 0,
      // la semana en curso está incompleta: sin esta marca, un lunes la
      // cobertura "12%" parece un desplome y mata la confianza en el dashboard
      isPartial: w.isCurrent,
    }
  })
}

// ---------- team load ----------
export function ownerLoad(projects) {
  const map = {}
  const now = Date.now()
  const from7 = new Date(now - 7 * DAY)
  const to = new Date(now)
  for (const p of projects) {
    if (p.completed) continue
    const owner = p.owner || 'Sin asignar'
    if (!map[owner]) map[owner] = { owner, active: 0, onTrack: 0, risk: 0, hold: 0, neglected: 0, meetings7d: 0, hours7d: 0 }
    const o = map[owner]
    o.active++
    const st = statusOf(p)
    if (st === 'on_track') o.onTrack++
    else if (st === 'at_risk' || st === 'off_track') o.risk++
    else if (st === 'on_hold') o.hold++
    if (p.hasMetrics && st !== 'on_hold' && (p.daysSinceLastMeeting === null || p.daysSinceLastMeeting > 7)) o.neglected++
    for (const m of p.meetingDetails || []) {
      if (inRange(m.date, from7, to)) { o.meetings7d++; o.hours7d += (m.minutes || 0) / 60 }
    }
  }
  return Object.values(map)
    .map(o => ({ ...o, hours7d: Math.round(o.hours7d * 10) / 10 }))
    .sort((a, b) => b.active - a.active)
}

// ---------- meetings/hours in a window ----------
export function effortWindow(projects, from, to) {
  let meetings = 0, minutes = 0
  for (const p of projects) {
    for (const m of p.meetingDetails || []) {
      if (inRange(m.date, from, to)) { meetings++; minutes += m.minutes || 0 }
    }
  }
  return { meetings, hours: Math.round((minutes / 60) * 10) / 10 }
}

// ---------- monthly closes ----------
export function monthlyCloses(completed, months = 6) {
  const now = new Date()
  const buckets = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', ''),
      year: d.getFullYear(), month: d.getMonth(),
      count: 0,
    })
  }
  for (const p of completed) {
    if (!p.completedAt) continue
    const d = new Date(p.completedAt)
    const b = buckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth())
    if (b) b.count++
  }
  return buckets
}

// ---------- SLA reference (P50/P80 of completed, by type) ----------
export function slaReference(completed) {
  const ref = {}
  for (const type of ['Setup', 'Upgrade', 'Reonboarding']) {
    const days = completed.filter(p => p.type === type && p.days > 0).map(p => p.days)
    ref[type] = { p50: percentile(days, 50), p80: percentile(days, 80), n: days.length }
  }
  return ref
}

export function slaRisk(project, ref) {
  const r = ref[project.type] || ref.Setup
  if (!r || !r.n || !project.days) return null
  if (project.days > r.p80) return 'alto'
  if (project.days > r.p50) return 'medio'
  return 'bajo'
}

// ---------- calibrated assessment ----------
// Una sola vara de medir: compara cada proyecto activo contra la duración
// esperada del modelo calibrado (segmento + canales), en días HÁBILES.
// Devuelve null si el proyecto no es evaluable (sin canales o sin fecha).
export function calibratedAssessment(p, calibration) {
  if (!calibration?.segments || !p.totalChannels) return null
  const startStr = p.start || p.createdAt?.split('T')[0]
  if (!startStr) return null

  // isComplexIntegration compara contra MAYÚSCULAS; /api/projects normaliza a Title Case
  const channelsUpper = (p.channels || []).map(c => String(c).toUpperCase())
  const est = calculateEstimation(p.plan, p.type, p.totalChannels, channelsUpper, calibration)

  const start = new Date(startStr.length === 10 ? `${startStr}T00:00:00` : startStr)
  const endRef = p.completed && p.completedAt ? new Date(p.completedAt) : new Date()
  const elapsed = businessDaysBetween(start, endRef)

  let bucket
  if (elapsed > est.conservador) bucket = 'overP80'
  else if (elapsed > est.esperado) bucket = 'over'
  else if (est.esperado - elapsed <= 10) bucket = 'near'
  else bucket = 'onPlan'

  return {
    expected: est.esperado,
    optimista: est.optimista,
    conservador: est.conservador,
    elapsed,
    overPct: est.esperado > 0 ? Math.round(((elapsed - est.esperado) / est.esperado) * 100) : 0,
    bucket,
    projectedEnd: addBusinessDays(start, est.esperado),
    p80End: addBusinessDays(start, est.conservador),
  }
}

export const OUTLOOK_BUCKETS = {
  onPlan: { label: 'En plazo' },
  near: { label: 'Por vencer' },
  over: { label: 'Sobre plan' },
  overP80: { label: 'Sobre P80' },
}

// Distribución de la cartera activa vs el plan calibrado (excluye pausados)
export function estimationOutlook(active, calibration) {
  const buckets = { onPlan: [], near: [], over: [], overP80: [] }
  let unassessed = 0
  for (const p of active) {
    if (statusOf(p) === 'on_hold') continue
    const a = calibratedAssessment(p, calibration)
    if (!a) { unassessed++; continue }
    buckets[a.bucket].push({ project: p, assessment: a })
  }
  const assessed = Object.values(buckets).reduce((s, arr) => s + arr.length, 0)
  const overCount = buckets.over.length + buckets.overP80.length
  return {
    buckets,
    assessed,
    unassessed,
    pctOverPlan: assessed > 0 ? Math.round((overCount / assessed) * 100) : 0,
  }
}

// ---------- close forecast ----------
// Cuántos proyectos deberían cerrar por semana según la vara calibrada,
// con bucket explícito para los que ya vencieron su fecha proyectada.
export function closeForecast(active, calibration, weeksAhead = 10) {
  const now = new Date()
  const weeks = []
  const cursor = new Date(now)
  for (let i = 0; i < weeksAhead; i++) {
    const week = getISOWeek(cursor)
    const { monday, sunday } = getWeekRange(cursor.getFullYear(), week)
    weeks.push({
      key: `${cursor.getFullYear()}-W${String(week).padStart(2, '0')}`,
      label: `S${week}`,
      fullLabel: `Sem ${week} (${fmtShort(monday)} – ${fmtShort(sunday)})`,
      monday, sunday,
      count: 0,
      byType: {},
    })
    cursor.setDate(cursor.getDate() + 7)
  }
  let overdue = 0
  for (const p of active) {
    if (statusOf(p) === 'on_hold') continue
    const a = calibratedAssessment(p, calibration)
    if (!a) continue
    if (a.projectedEnd < now) { overdue++; continue }
    const w = weeks.find(w => a.projectedEnd >= w.monday && a.projectedEnd <= w.sunday)
    if (w) {
      w.count++
      w.byType[p.type] = (w.byType[p.type] || 0) + 1
    }
  }
  return { overdue, weeks }
}

// ---------- portfolio flow ----------
// Aperturas vs cierres por mes + backlog retro-anclado al stock actual
// (backlog fin de mes M = activos hoy − aperturas posteriores + cierres posteriores)
export function monthlyFlow(allProjects, months = 6) {
  const now = new Date()
  const buckets = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', ''),
      year: d.getFullYear(), month: d.getMonth(),
      opened: 0, closed: 0,
      isPartial: i === 0,
    })
  }
  const bucketOf = (dateStr) => {
    if (!dateStr) return null
    const d = new Date(dateStr)
    return buckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth())
  }
  for (const p of allProjects) {
    const ob = bucketOf(p.start || p.createdAt)
    if (ob) ob.opened++
    if (p.completed) {
      const cb = bucketOf(p.completedAt)
      if (cb) cb.closed++
    }
  }
  // retro-anclaje del backlog
  let backlog = allProjects.filter(p => !p.completed).length
  for (let i = buckets.length - 1; i >= 0; i--) {
    buckets[i].backlog = backlog
    backlog = backlog - buckets[i].opened + buckets[i].closed
  }
  for (const b of buckets) b.net = b.opened - b.closed
  return buckets
}

// ---------- owner throughput (flujo y eficiencia, no solo stock) ----------
export function ownerThroughput(completed, windowDays = 90) {
  const cutoff = new Date(Date.now() - windowDays * DAY)
  const map = {}
  for (const p of completed) {
    if (!p.completedAt || new Date(p.completedAt) < cutoff) continue
    const owner = p.owner || 'Sin asignar'
    if (!map[owner]) map[owner] = { owner, closes: 0, daysList: [], hoursList: [] }
    const o = map[owner]
    o.closes++
    if (p.days > 0) o.daysList.push(p.days)
    // solo cierres con reuniones DIIO registradas — los anteriores a la adopción
    // del webhook tienen horas artificialmente en cero y sesgarían la comparación
    if ((p.meetings ?? 0) > 0 && p.totalHours > 0) o.hoursList.push(p.totalHours)
  }
  return Object.values(map).map(o => ({
    owner: o.owner,
    closes: o.closes,
    // n<3: mediana suprimida para no sacar conclusiones de desempeño con muestra mínima
    medianDays: o.daysList.length >= 3 ? percentile(o.daysList, 50) : null,
    hoursPerClose: o.hoursList.length >= 3
      ? Math.round((o.hoursList.reduce((s, h) => s + h, 0) / o.hoursList.length) * 10) / 10
      : null,
  }))
}

// ---------- cycle time trend (P50/P80 por trimestre de cierre, por tipo) ----------
export function cycleTimeTrend(completed, quarters = 6) {
  const now = new Date()
  const buckets = []
  for (let i = quarters - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1)
    const q = Math.floor(d.getMonth() / 3)
    const key = `${d.getFullYear()}-Q${q + 1}`
    if (!buckets.find(b => b.key === key)) {
      buckets.push({ key, label: `Q${q + 1} '${String(d.getFullYear()).slice(2)}`, year: d.getFullYear(), q, types: {} })
    }
  }
  for (const p of completed) {
    if (!p.completedAt || !(p.days > 0)) continue
    const d = new Date(p.completedAt)
    const b = buckets.find(b => b.year === d.getFullYear() && b.q === Math.floor(d.getMonth() / 3))
    if (!b) continue
    if (!b.types[p.type]) b.types[p.type] = []
    b.types[p.type].push(p.days)
  }
  return buckets.map(b => {
    const row = { key: b.key, label: b.label }
    for (const type of ['Setup', 'Upgrade', 'Reonboarding']) {
      const days = b.types[type] || []
      // n<5: punto suprimido — P50/P80 sobre 2-3 proyectos es ruido, no tendencia
      row[type] = days.length >= 5 ? percentile(days, 50) : null
      row[`${type}P80`] = days.length >= 5 ? percentile(days, 80) : null
      row[`${type}N`] = days.length
    }
    return row
  })
}
