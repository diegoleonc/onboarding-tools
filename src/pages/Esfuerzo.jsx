import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Clock, Video, RefreshCw, TrendingUp, ArrowUpDown, ExternalLink, Search, Loader2, AlertTriangle } from 'lucide-react'

// Multivende brand colors
const BRAND = {
  navy: '#2B4063',
  blue: '#6681C6',
  green: '#54CC85',
  pink: '#D95FB6',
  red: '#F05B54',
  yellow: '#F8D63C',
  orange: '#FC9B27',
}

const CHART_COLORS = [BRAND.blue, BRAND.pink, BRAND.orange, BRAND.green, BRAND.navy, BRAND.red, BRAND.yellow, '#8b5cf6']

const tooltipStyle = {
  contentStyle: { fontFamily: 'Poppins', borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }
}

function formatHours(hours) {
  if (hours === 0) return '0h'
  if (hours < 1) return `${Math.round(hours * 60)}m`
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function daysSinceLabel(days) {
  if (days === null || days === undefined) return null
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  return `Hace ${days}d`
}

export default function Esfuerzo() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortField, setSortField] = useState('daysSinceLastMeeting')
  const [sortDir, setSortDir] = useState('desc')
  const [filter, setFilter] = useState('active')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [search, setSearch] = useState('')

  async function fetchMetrics() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/project-metrics')
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMetrics() }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="animate-spin" size={40} style={{ color: BRAND.blue }} />
        <span className="text-slate-500 text-sm">Calculando métricas de esfuerzo...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl p-6 border" style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA' }}>
        <p className="font-medium" style={{ color: BRAND.red }}>Error al cargar métricas</p>
        <p className="text-sm mt-1 text-slate-600">{error}</p>
        <button onClick={fetchMetrics} className="mt-3 text-sm px-4 py-2 rounded-lg text-white hover:opacity-90 transition-opacity" style={{ backgroundColor: BRAND.navy }}>
          Reintentar
        </button>
      </div>
    )
  }

  if (!data) return null

  const { projects, totals, meta } = data

  // Get unique owners for dropdown
  const owners = [...new Set(projects.map(p => p.owner))].sort()

  let filtered = projects
  if (filter === 'active') filtered = filtered.filter(p => !p.completed)
  if (filter === 'completed') filtered = filtered.filter(p => p.completed)
  if (ownerFilter !== 'all') {
    filtered = filtered.filter(p => p.owner === ownerFilter)
  }
  if (search) {
    const s = search.toLowerCase()
    filtered = filtered.filter(p => p.name.toLowerCase().includes(s))
  }

  const STRING_FIELDS = ['owner', 'statusType']
  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortField] ?? (STRING_FIELDS.includes(sortField) ? '' : -1)
    const bVal = b[sortField] ?? (STRING_FIELDS.includes(sortField) ? '' : -1)
    if (STRING_FIELDS.includes(sortField)) {
      const cmp = String(aVal).localeCompare(String(bVal))
      return sortDir === 'desc' ? -cmp : cmp
    }
    return sortDir === 'desc' ? (bVal || 0) - (aVal || 0) : (aVal || 0) - (bVal || 0)
  })

  // Bar chart: top 15 by hours
  const topByHours = [...filtered]
    .filter(p => p.totalHours > 0)
    .sort((a, b) => b.totalHours - a.totalHours)
    .slice(0, 15)
    .map(p => ({
      name: p.name.split(' - ')[0].substring(0, 20),
      horas: p.totalHours,
      reuniones: p.meetings,
    }))

  // Status distribution for pie chart (active projects only)
  const activeProjects = projects.filter(p => !p.completed)
  const statusCounts = {}
  for (const p of activeProjects) {
    const st = p.statusType || 'sin_estado'
    statusCounts[st] = (statusCounts[st] || 0) + 1
  }

  const STATUS_PIE_CONFIG = {
    on_track: { label: 'En curso', color: '#10b981' },
    at_risk: { label: 'En riesgo', color: '#f59e0b' },
    off_track: { label: 'Con retraso', color: '#ef4444' },
    on_hold: { label: 'En espera', color: '#6366f1' },
    sin_estado: { label: 'Sin estado', color: '#94a3b8' },
  }

  const statusPieData = Object.entries(statusCounts)
    .map(([key, count]) => ({
      name: STATUS_PIE_CONFIG[key]?.label || key,
      value: count,
      fill: STATUS_PIE_CONFIG[key]?.color || '#94a3b8',
    }))
    .sort((a, b) => b.value - a.value)

  // Owner workload
  const ownerMap = {}
  for (const p of filtered) {
    if (!ownerMap[p.owner]) ownerMap[p.owner] = { owner: p.owner, hours: 0, meetings: 0, projects: 0 }
    ownerMap[p.owner].hours += p.totalHours
    ownerMap[p.owner].meetings += p.meetings
    ownerMap[p.owner].projects++
  }
  const ownerData = Object.values(ownerMap).sort((a, b) => b.projects - a.projects)

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ field }) => (
    <ArrowUpDown size={12} className="inline ml-1" style={{ color: sortField === field ? BRAND.blue : '#cbd5e1' }} />
  )

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="brand-gradient rounded-2xl p-8 text-white relative overflow-hidden">
        <img src="/isotipo.png" alt="" className="absolute right-6 top-1/2 -translate-y-1/2 h-24 opacity-10" />
        <div className="flex items-center justify-between relative z-10">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>Esfuerzo por Proyecto</h1>
            <p className="text-white/60 text-sm">
              Métricas de tiempo efectivo basadas en reuniones DIIO
              {meta?.fetchedAt && (
                <span className="ml-2 text-white/40">
                  — {new Date(meta.fetchedAt).toLocaleTimeString('es-CL')}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={fetchMetrics}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors backdrop-blur-sm"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<AlertTriangle size={18} />}
          label="Sin atención"
          value={totals.neglectedProjects}
          sub={`>7 días sin reunión`}
          color={totals.neglectedProjects > 0 ? BRAND.red : BRAND.green}
          alert={totals.neglectedProjects > 0}
        />
        <KpiCard icon={<Video size={18} />} label="Reuniones DIIO" value={totals.meetings} sub={`${totals.activeProjects} proyectos activos`} color={BRAND.blue} />
        <KpiCard icon={<Clock size={18} />} label="Tiempo total" value={formatHours(totals.totalHours)} sub={`${totals.totalMinutes} minutos`} color={BRAND.green} />
        <KpiCard icon={<TrendingUp size={18} />} label="Promedio por proyecto" value={totals.projectsWithActivity > 0 ? formatHours(Math.round(totals.totalHours / totals.projectsWithActivity * 10) / 10) : '—'} sub={`${totals.projectsWithActivity} con actividad`} color={BRAND.orange} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 card-hover">
          <h3 className="text-sm font-semibold mb-3" style={{ color: BRAND.navy }}>Top 15 — Horas por proyecto</h3>
          {topByHours.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topByHours} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fontFamily: 'Poppins' }} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value, name) => {
                    if (name === 'horas') return [`${value}h`, 'Horas']
                    return [value, 'Reuniones']
                  }}
                />
                <Bar dataKey="horas" fill={BRAND.blue} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
              Sin datos de duración disponibles
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 card-hover">
          <h3 className="text-sm font-semibold mb-3" style={{ color: BRAND.navy }}>Estado de proyectos activos</h3>
          {statusPieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(value) => `${value} proyectos`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {statusPieData.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.fill }} />
                      <span className="text-slate-600">{s.name}</span>
                    </div>
                    <span className="font-medium text-slate-700">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
              Sin datos disponibles
            </div>
          )}

          {/* Owner workload */}
          {ownerData.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Carga por implementador</h4>
              <div className="space-y-1.5">
                {ownerData.map((o, i) => (
                  <div key={o.owner} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-slate-600">{o.owner}</span>
                    </div>
                    <span className="text-slate-500">
                      {o.projects}p · {o.meetings}r · {formatHours(o.hours)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-white border border-slate-200 rounded-lg overflow-hidden text-sm">
          {[
            ['all', 'Todos'],
            ['active', 'Activos'],
            ['completed', 'Completados'],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-3 py-1.5 transition-colors ${filter === val ? 'text-white font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
              style={filter === val ? { backgroundColor: BRAND.navy } : {}}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={ownerFilter}
          onChange={e => setOwnerFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 bg-white"
          style={{ '--tw-ring-color': BRAND.blue }}
        >
          <option value="all">Todos los implementadores</option>
          {owners.map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>

        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar proyecto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': BRAND.blue }}
          />
        </div>
        <span className="text-xs text-slate-400">
          {sorted.length} proyecto{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden card-hover">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC' }} className="border-b border-slate-200">
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Proyecto</th>
                <th className="text-left px-3 py-3 text-slate-600 font-medium cursor-pointer select-none" onClick={() => toggleSort('owner')}>
                  Implementador <SortIcon field="owner" />
                </th>
                <th className="text-center px-3 py-3 text-slate-600 font-medium cursor-pointer select-none" onClick={() => toggleSort('statusType')}>
                  Estado <SortIcon field="statusType" />
                </th>
                <th className="text-center px-3 py-3 text-slate-600 font-medium cursor-pointer select-none" onClick={() => toggleSort('meetings')}>
                  Reuniones <SortIcon field="meetings" />
                </th>
                <th className="text-center px-3 py-3 text-slate-600 font-medium cursor-pointer select-none" onClick={() => toggleSort('totalHours')}>
                  Horas <SortIcon field="totalHours" />
                </th>
                <th className="text-center px-3 py-3 text-slate-600 font-medium cursor-pointer select-none" onClick={() => toggleSort('daysSinceLastMeeting')}>
                  Última reunión <SortIcon field="daysSinceLastMeeting" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.gid} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${p.completed ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={p.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline font-medium truncate max-w-[280px]"
                        style={{ color: BRAND.blue }}
                        title={p.name}
                      >
                        {p.name.split(' - ')[0]}
                      </a>
                      <ExternalLink size={12} className="text-slate-300 flex-shrink-0" />
                      {p.completed && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: `${BRAND.green}18`, color: BRAND.green }}>Completado</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{p.owner}</td>
                  <td className="px-3 py-3 text-center">
                    <StatusBadge status={p.statusType} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {p.meetings > 0 ? (
                      <span className="inline-flex items-center gap-1 font-medium" style={{ color: BRAND.blue }}>
                        <Video size={12} /> {p.meetings}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center font-medium" style={{ color: BRAND.navy }}>
                    {p.totalHours > 0 ? formatHours(p.totalHours) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <LastMeetingCell days={p.daysSinceLastMeeting} completed={p.completed} />
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    No se encontraron proyectos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ===== SHARED COMPONENTS =====
const STATUS_CONFIG = {
  on_track: { label: 'En curso', bg: '#d1fae5', color: '#059669', dot: '#10b981' },
  at_risk: { label: 'En riesgo', bg: '#fef3c7', color: '#d97706', dot: '#f59e0b' },
  off_track: { label: 'Con retraso', bg: '#fee2e2', color: '#dc2626', dot: '#ef4444' },
  on_hold: { label: 'En espera', bg: '#e0e7ff', color: '#4f46e5', dot: '#6366f1' },
  complete: { label: 'Finalizado', bg: '#d1fae5', color: '#059669', dot: '#10b981' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status]
  if (!cfg) return <span className="text-slate-300 text-xs">—</span>
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
      {cfg.label}
    </span>
  )
}

function LastMeetingCell({ days, completed }) {
  if (completed) return <span className="text-slate-300 text-xs">—</span>
  if (days === null || days === undefined) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
        Sin reuniones
      </span>
    )
  }
  const label = daysSinceLabel(days)
  if (days > 14) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
        <AlertTriangle size={10} /> {label}
      </span>
    )
  }
  if (days > 7) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-600">
        <AlertTriangle size={10} /> {label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600">
      {label}
    </span>
  )
}

function KpiCard({ icon, label, value, sub, color, alert }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 card-hover ${alert ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}>
      <div className="flex items-center gap-2 text-sm mb-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color: alert ? BRAND.red : BRAND.navy }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
