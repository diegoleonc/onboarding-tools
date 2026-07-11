// Reporte ejecutivo en texto plano/Markdown — para pegar en Slack o email.
// Solo incluye cifras que ya están calculadas en pantalla (misma fuente de verdad).
import { formatHours } from './insights'

const fmtDate = (d) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

export function buildExecutiveReport({ kpis, attention, team, flow, outlook, hasMetrics, calibrationLive }) {
  const lines = []
  const now = new Date()
  lines.push(`*Onboarding Ops — Resumen ejecutivo* · ${fmtDate(now)}`)
  lines.push('')

  // KPIs
  lines.push(`• Proyectos activos: *${kpis.total}* (${kpis.byStatus.on_hold} en pausa)`)
  lines.push(`• En riesgo / atrasados: *${kpis.risk}*`)
  if (hasMetrics && kpis.neglected !== null) lines.push(`• Sin reunión hace +7d: *${kpis.neglected}*`)
  if (hasMetrics) {
    const deltaH = Math.round((kpis.e7.hours - kpis.ePrev7.hours) * 10) / 10
    lines.push(`• Horas DIIO últimos 7d: *${formatHours(kpis.e7.hours)}* (${kpis.e7.meetings} reuniones, ${deltaH >= 0 ? '+' : ''}${deltaH}h vs semana previa)`)
  }
  lines.push(`• Cierres del trimestre: *${kpis.closesQ}*`)

  // Flujo del mes (aperturas/cierres del mes en curso + mes anterior completo)
  if (flow?.length >= 2) {
    const cur = flow[flow.length - 1]
    const prev = flow[flow.length - 2]
    lines.push(`• Flujo ${cur.label} (parcial): ${cur.opened} aperturas / ${cur.closed} cierres · ${prev.label}: ${prev.opened}/${prev.closed} (neto ${prev.net > 0 ? '+' : ''}${prev.net})`)
  }

  // Cartera vs plan calibrado
  if (outlook?.assessed > 0) {
    const b = outlook.buckets
    lines.push(`• Cartera vs plan${calibrationLive ? ' (calibración live)' : ''}: ${b.onPlan.length} en plazo · ${b.near.length} por vencer · ${b.over.length} sobre plan · ${b.overP80.length} sobre P80 (*${outlook.pctOverPlan}% sobre plan*)`)
  }
  lines.push('')

  // Top atención
  if (attention?.length) {
    lines.push(`*Requiere atención (top ${Math.min(5, attention.length)} de ${attention.length}):*`)
    for (const { project: p, reasons } of attention.slice(0, 5)) {
      lines.push(`  – ${p.company || p.name} [${p.type}] — ${reasons.map(r => r.text).join(', ')} (${p.owner || 'sin asignar'})`)
    }
    lines.push('')
  }

  // Carga del equipo
  if (team?.length) {
    lines.push('*Carga por implementadora:*')
    for (const o of team) {
      const bits = [`${o.active} activos`]
      if (o.risk > 0) bits.push(`${o.risk} en riesgo`)
      if (hasMetrics && o.neglected > 0) bits.push(`${o.neglected} sin reunión +7d`)
      if (o.closes90 !== undefined && o.closes90 !== null) bits.push(`${o.closes90} cierres/90d`)
      lines.push(`  – ${o.owner}: ${bits.join(' · ')}`)
    }
  }

  return lines.join('\n')
}
