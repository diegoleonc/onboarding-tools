import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line, LineChart, ReferenceLine, Cell } from 'recharts'
import { STATUS, GRID, INK, CAT, SURFACE, TIPO } from '../theme'

const AXIS_TICK = { fontSize: 11, fontFamily: 'Poppins', fill: INK.muted }

// ---------- shared tooltip shell ----------
export function TooltipShell({ title, rows, footer }) {
  return (
    <div style={{
      background: 'white', borderRadius: 12, padding: '12px 16px',
      boxShadow: '0 8px 30px rgba(31,42,68,0.14)', border: `1px solid ${GRID}`,
      minWidth: 180, fontFamily: 'Poppins, sans-serif',
    }}>
      {title && <p style={{ fontWeight: 600, fontSize: 12, color: INK.primary, marginBottom: 8 }}>{title}</p>}
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 4 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: INK.secondary }}>
            {r.color && <span style={{ width: 8, height: 8, borderRadius: 4, background: r.color, display: 'inline-block' }} />}
            {r.label}
          </span>
          <span style={{ fontWeight: 600, fontSize: 12, color: INK.primary, fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
        </div>
      ))}
      {footer && (
        <div style={{ borderTop: `1px solid ${GRID}`, paddingTop: 6, marginTop: 6, fontSize: 11, color: INK.muted }}>
          {footer}
        </div>
      )}
    </div>
  )
}

// ---------- weekly coverage (stacked: con reunión context, sin reunión emphasis) ----------
const COV = { con: '#9FB4DC', sin: STATUS.off_track.color }

export function CoverageChart({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="semana" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'rgba(31,42,68,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0]?.payload
            if (!d) return null
            return (
              <TooltipShell
                title={d.isPartial ? `${d.fullLabel} — en curso` : d.fullLabel}
                rows={[
                  { label: 'Con reunión', value: d.conReunion, color: COV.con },
                  { label: 'Sin reunión', value: d.sinReunion, color: COV.sin },
                  { label: 'Total activos', value: d.total },
                ]}
                footer={d.isPartial ? `${d.pct}% de cobertura (semana parcial)` : `${d.pct}% de cobertura`}
              />
            )
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, fontFamily: 'Poppins', color: INK.secondary }}
          iconType="circle" iconSize={8}
          formatter={v => <span style={{ color: INK.secondary, fontSize: 12 }}>{v === 'conReunion' ? 'Con reunión' : 'Sin reunión'}</span>}
        />
        {/* semana en curso atenuada: está incompleta y no es comparable */}
        <Bar dataKey="conReunion" stackId="a" fill={COV.con} maxBarSize={22} stroke={SURFACE} strokeWidth={1}>
          {data.map((d, i) => <Cell key={i} opacity={d.isPartial ? 0.45 : 1} />)}
        </Bar>
        <Bar dataKey="sinReunion" stackId="a" fill={COV.sin} maxBarSize={22} radius={[4, 4, 0, 0]} stroke={SURFACE} strokeWidth={1}>
          {data.map((d, i) => <Cell key={i} opacity={d.isPartial ? 0.45 : 1} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------- pipeline by type, segmented by status ----------
const PIPE_KEYS = [
  ['on_track', STATUS.on_track],
  ['at_risk', STATUS.at_risk],
  ['off_track', STATUS.off_track],
  ['on_hold', STATUS.on_hold],
  ['none', STATUS.none],
]

export function PipelineChart({ data, height = 200 }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} allowDecimals={false} />
        <YAxis dataKey="tipo" type="category" tick={{ ...AXIS_TICK, fontSize: 12, fill: INK.secondary }} width={100} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: 'rgba(31,42,68,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0]?.payload
            if (!d) return null
            return (
              <TooltipShell
                title={`${d.tipo} — ${d.total} activos`}
                rows={PIPE_KEYS.filter(([k]) => d[k] > 0).map(([k, s]) => ({ label: s.label, value: d[k], color: s.color }))}
              />
            )
          }}
        />
        {PIPE_KEYS.map(([key, s], i) => (
          <Bar key={key} dataKey={key} stackId="a" fill={s.color} maxBarSize={20}
            stroke={SURFACE} strokeWidth={1}
            radius={i === PIPE_KEYS.length - 1 ? [0, 4, 4, 0] : 0} />
        ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2">
        {PIPE_KEYS.map(([k, s]) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: INK.secondary }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------- monthly closes (single series, slot-1 hue) ----------
export function ClosesChart({ data, height = 200 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -22, right: 8, top: 18, bottom: 0 }} barCategoryGap="35%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'rgba(31,42,68,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0]?.payload
            return <TooltipShell rows={[{ label: d.label, value: `${d.count} cierres`, color: CAT[0] }]} />
          }}
        />
        <Bar dataKey="count" fill={CAT[0]} maxBarSize={22} radius={[4, 4, 0, 0]}
          label={{ position: 'top', fontSize: 11, fontFamily: 'Poppins', fill: INK.muted }} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------- portfolio flow: aperturas vs cierres + backlog line ----------
// Identidad fija: aperturas CAT[0], cierres CAT[1]; el backlog es una medida
// derivada y va en tinta neutra. Un solo eje (todo son conteos de proyectos).
const FLOW = { opened: CAT[0], closed: CAT[1], backlog: INK.secondary }

export function FlowChart({ data, height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 0 }} barCategoryGap="25%" barGap={2}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'rgba(31,42,68,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0]?.payload
            if (!d) return null
            return (
              <TooltipShell
                title={d.isPartial ? `${d.label} — mes en curso` : d.label}
                rows={[
                  { label: 'Aperturas', value: d.opened, color: FLOW.opened },
                  { label: 'Cierres', value: d.closed, color: FLOW.closed },
                  { label: 'Neto', value: `${d.net > 0 ? '+' : ''}${d.net}` },
                  { label: 'Backlog al cierre', value: d.backlog, color: FLOW.backlog },
                ]}
                footer={d.isPartial ? 'Mes incompleto — no comparable' : undefined}
              />
            )
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, fontFamily: 'Poppins' }}
          iconType="circle" iconSize={8}
          formatter={v => <span style={{ color: INK.secondary, fontSize: 12 }}>{{ opened: 'Aperturas', closed: 'Cierres', backlog: 'Backlog' }[v] || v}</span>}
        />
        <Bar dataKey="opened" fill={FLOW.opened} maxBarSize={16} radius={[4, 4, 0, 0]} stroke={SURFACE} strokeWidth={1}>
          {data.map((d, i) => <Cell key={i} opacity={d.isPartial ? 0.45 : 1} />)}
        </Bar>
        <Bar dataKey="closed" fill={FLOW.closed} maxBarSize={16} radius={[4, 4, 0, 0]} stroke={SURFACE} strokeWidth={1}>
          {data.map((d, i) => <Cell key={i} opacity={d.isPartial ? 0.45 : 1} />)}
        </Bar>
        <Line dataKey="backlog" stroke={FLOW.backlog} strokeWidth={2} dot={{ r: 3, fill: FLOW.backlog, stroke: SURFACE, strokeWidth: 2 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ---------- cycle time trend: P50 de días a cierre por trimestre, por tipo ----------
// Color sigue la identidad de tipo ya establecida en TIPO (badges de toda la app)
const TREND_TYPES = ['Setup', 'Upgrade', 'Reonboarding', 'Sistemas']

export function CycleTimeTrendChart({ data, height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} unit="d" />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const d = payload[0]?.payload
            if (!d) return null
            const rows = TREND_TYPES
              .filter(t => d[`${t}N`] > 0)
              .map(t => ({
                label: `${t} (n=${d[`${t}N`]})`,
                value: d[t] !== null ? `P50 ${d[t]}d · P80 ${d[`${t}P80`]}d` : `n<5, sin dato`,
                color: TIPO[t]?.color,
              }))
            return <TooltipShell title={label} rows={rows} footer="Días calendario a cierre · puntos con n<5 suprimidos" />
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, fontFamily: 'Poppins' }}
          iconType="circle" iconSize={8}
          formatter={v => <span style={{ color: INK.secondary, fontSize: 12 }}>{v}</span>}
        />
        {TREND_TYPES.map(t => (
          <Line key={t} dataKey={t} name={t} stroke={TIPO[t]?.color} strokeWidth={2}
            dot={{ r: 3.5, fill: TIPO[t]?.color, stroke: SURFACE, strokeWidth: 2 }}
            connectNulls={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ---------- close forecast: cierres proyectados por semana (vara calibrada) ----------
export function ForecastChart({ data, avgPerWeek, height = 220 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -22, right: 8, top: 18, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'rgba(31,42,68,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0]?.payload
            if (!d) return null
            const rows = Object.entries(d.byType || {}).map(([t, n]) => ({ label: t, value: n, color: TIPO[t]?.color }))
            return (
              <TooltipShell
                title={d.fullLabel}
                rows={rows.length ? rows : [{ label: 'Cierres proyectados', value: d.count }]}
                footer={`${d.count} proyectados según plan calibrado`}
              />
            )
          }}
        />
        {avgPerWeek > 0 && (
          <ReferenceLine y={avgPerWeek} stroke={INK.muted} strokeDasharray="4 3"
            label={{ value: `ritmo real ${avgPerWeek}/sem`, position: 'insideTopRight', fontSize: 10, fontFamily: 'Poppins', fill: INK.muted }} />
        )}
        <Bar dataKey="count" fill={CAT[0]} maxBarSize={22} radius={[4, 4, 0, 0]}
          label={{ position: 'top', fontSize: 11, fontFamily: 'Poppins', fill: INK.muted }} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------- model precision: duración real vs predicha por trimestre ----------
// La real lleva la identidad de serie (CAT[0]); la predicción es referencia
// derivada del modelo y va en tinta neutra punteada.
export function PrecisionChart({ data, height = 220 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="quarter" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} unit="d" />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const d = payload[0]?.payload
            if (!d) return null
            return (
              <TooltipShell
                title={label}
                rows={[
                  { label: 'Mediana real', value: `${d.medianReal}d`, color: CAT[0] },
                  { label: 'Mediana predicha', value: `${d.medianPred}d`, color: INK.muted },
                  { label: 'Dentro de banda P25-P80', value: `${d.inBandPct}%` },
                ]}
                footer={`${d.n} proyectos cerrados en el trimestre`}
              />
            )
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, fontFamily: 'Poppins' }}
          iconType="circle" iconSize={8}
          formatter={v => <span style={{ color: INK.secondary, fontSize: 12 }}>{v === 'medianReal' ? 'Real (mediana)' : 'Predicho por el modelo'}</span>}
        />
        <Line dataKey="medianReal" stroke={CAT[0]} strokeWidth={2} dot={{ r: 3.5, fill: CAT[0], stroke: SURFACE, strokeWidth: 2 }} />
        <Line dataKey="medianPred" stroke={INK.muted} strokeWidth={2} strokeDasharray="5 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ---------- horizontal load bar (single hue, labeled rows) ----------
export function LoadBar({ value, max, color = CAT[0] }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#EDF1F7' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}
