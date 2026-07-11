// ============================================================
// Insight engine — turns raw project + effort data into the
// prioritized signals the command center runs on.
// ============================================================
import { statusOf } from '../theme'

const DAY = 24 * 60 * 60 * 1000

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
export function buildAttention(projects) {
  const items = []
  for (const p of projects) {
    if (p.completed) continue
    const st = statusOf(p)
    if (st === 'complete') continue
    let score = 0
    const reasons = []

    if (st === 'off_track') { score += 30; reasons.push({ text: 'Atrasado', kind: 'off_track' }) }
    else if (st === 'at_risk') { score += 20; reasons.push({ text: 'En riesgo', kind: 'at_risk' }) }

    const d = p.daysSinceLastMeeting
    if (p.hasMetrics) {
      if (d === null || d === undefined) {
        if ((p.days ?? 0) > 7 && st !== 'on_hold') { score += 18; reasons.push({ text: 'Nunca ha tenido reunión', kind: 'meeting' }) }
      } else if (d > 21 && st !== 'on_hold') { score += 22; reasons.push({ text: `${d} días sin reunión`, kind: 'meeting' }) }
      else if (d > 14 && st !== 'on_hold') { score += 15; reasons.push({ text: `${d} días sin reunión`, kind: 'meeting' }) }
      else if (d > 7 && st !== 'on_hold') { score += 8; reasons.push({ text: `${d} días sin reunión`, kind: 'meeting' }) }
    }

    if (p.end) {
      const overdue = Math.floor((Date.now() - new Date(p.end).getTime()) / DAY)
      if (overdue > 0) { score += Math.min(25, 10 + overdue / 3); reasons.push({ text: `Vencido hace ${overdue}d`, kind: 'due' }) }
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
