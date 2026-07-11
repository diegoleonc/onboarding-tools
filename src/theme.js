// ============================================================
// Multivende — Design tokens for the Onboarding Ops platform
// Categorical palette validated (CVD, lightness band, chroma
// floor, contrast) against white surface. Do not reorder.
// ============================================================

export const SURFACE = '#FFFFFF'
export const CANVAS = '#F3F5FA'

export const INK = {
  primary: '#1F2A44',   // titles, values
  secondary: '#475569', // body
  muted: '#7C8BA5',     // captions, axis text
  faint: '#B4BFD3',
}

export const BRAND = {
  navy: '#2B4063',
  blue: '#6681C6',
  green: '#3FBF73',
  red: '#EE4941',
}

// Categorical — fixed order, never cycled. Validated: all six checks PASS.
export const CAT = ['#5C7BC9', '#D97706', '#B84D9B', '#238B55', '#35558F']

// Status — reserved meanings, always paired with label (+dot/icon)
export const STATUS = {
  on_track:  { label: 'En curso',    color: '#1F9A55', bg: '#E5F5EC', text: '#166B3D' },
  at_risk:   { label: 'En riesgo',   color: '#D97706', bg: '#FCF0DE', text: '#92550A' },
  off_track: { label: 'Atrasado',    color: '#D93830', bg: '#FCE9E8', text: '#A02722' },
  on_hold:   { label: 'En pausa',    color: '#64748B', bg: '#EDF1F6', text: '#475569' },
  complete:  { label: 'Completado',  color: '#35558F', bg: '#E8EDF7', text: '#2B4063' },
  none:      { label: 'Sin estado',  color: '#94A3B8', bg: '#F1F5F9', text: '#64748B' },
}

// Sequential ramp (single hue, light→dark) for magnitude (heatmap)
export const RAMP = ['#EDF1FA', '#D4DEF1', '#AFC0E3', '#84A0D3', '#5C7BC9', '#35558F']

export const GRID = '#E7EBF3'
export const BORDER = '#E4E8F1'

export const TIPO = {
  Setup:        { color: CAT[0], bg: '#EBF0FA', text: '#3D5AA6' },
  Upgrade:      { color: CAT[2], bg: '#F8EAF4', text: '#933D7B' },
  Reonboarding: { color: CAT[1], bg: '#FBF0DF', text: '#A05E08' },
}

export function statusOf(project) {
  const st = project.statusType
  if (st && STATUS[st]) return st
  const s = project.status
  if (s === 'En Progreso') return 'on_track'
  if (s === 'En Pausa') return 'on_hold'
  if (s === 'Atrasado') return 'off_track'
  if (s === 'En Riesgo') return 'at_risk'
  if (s === 'Completado') return 'complete'
  return 'none'
}

export function ownerColor(name, owners) {
  const idx = owners.indexOf(name)
  return CAT[idx >= 0 ? idx % CAT.length : 0]
}

export function heatColor(hours, max) {
  if (!hours || hours <= 0) return null
  const t = Math.min(1, hours / Math.max(max, 0.1))
  const idx = Math.min(RAMP.length - 1, 1 + Math.floor(t * (RAMP.length - 1)))
  return RAMP[idx]
}
