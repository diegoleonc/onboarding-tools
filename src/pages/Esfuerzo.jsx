import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Clock, Video, RefreshCw, TrendingUp, ArrowUpDown, ExternalLink, Search, Loader2 } from 'lucide-react'

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

function EfficiencyBadge({ calendarDays, totalHours }) {
  if (!calendarDays || calendarDays === 0 || totalHours === 0) return null
  const ratio = totalHours / (calendarDays * 8) * 100
  const color = ratio > 15 ? BRAND.green : ratio > 5 ? BRAND.orange : BRAND.red
  return (
    <span className="text-xs font-medium" style={{ color }} title={`${totalHours}h efectivas en ${calendarDays} días calendario`}>
      {ratio.toFixed(1)}%
    </span>
  )
}

export default function Esfuerzo() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortField, setSortField] = useState('totalHours')
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

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortField] ?? 0
    const bVal = b[sortField] ?? 0
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal
  })

  const topByHours = [...filtered]
    .filter(p => p.totalHours > 0)
    .sort((a, b) => b.totalHours - a.totalHours)
    .slice(0, 15)
    .map(p => ({
      name: p.name.split(' - ')[0].substring(0, 20),
      horas: p.totalHours,
      reuniones: p.meetings,
    }))

  const ownerMap = {}
  for (const p of filtered) {
    if (!ownerMap[p.owner]) ownerMap[p.owner] = { owner: p.owner, hours: 0, meetings: 0, projects: 0 }
    ownerMap[p.owner].hours += p.totalHours
    ownerMap[p.owner].meetings += p.meetings
    ownerMap[p.owner].projects++
  }
  const ownerData = Object.values(ownerMap)
    .filter(o => o.hours > 0)
    .sort((a, b) => b.hours - a.hours)

  const ownerPieData = ownerData.map((o, i) => ({
    name: o.owner,
    value: Math.round(o.hours * 10) / 10,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }))

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ field }) => (
    <ArrowUpDown size={12} className={`inline ml-1`} style={{ color: sortField === field ? BRAND.blue : '#cbd5e1' }} />
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard icon={<Video size={18} />} label="Reuniones totales" value={totals.meetings} color={BRAND.blue} />
        <KpiCard icon={<Clock size={18} />} label="Tiempo total" value={formatHours(totals.totalHours)} sub={`${totals.totalMinutes} minutos`} color={BRAND.green} />
        <KpiCard icon={<TrendingUp size={18} />} label="Promedio por proyecto" value={totals.projectsWithActivity > 0 ? formatHours(Math.round(totals.totalHours / totals.projectsWithActivity * 10) / 10) : '—'} sub={`${totals.projectsWithActivity} proyectos con actividad`} color={BRAND.orange} />
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
          <h3 className="text-sm font-semibold mb-3" style={{ color: BRAND.navy }}>Distribución por implementador</h3>
          {ownerPieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={ownerPieData}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {ownerPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(value) => `${value}h`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {ownerData.map((o, i) => (
                  <div key={o.owner} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-slate-600">{o.owner}</span>
                    </div>
                    <div className="text-slate-500">
                      {formatHours(o.hours)} · {o.meetings}r · {o.projects}p
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
              Sin datos disponibles
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

        {/* Owner dropdown */}
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
          {meta?.fetchedAt ? ` · ${new Date(meta.fetchedAt).toLocaleTimeString('es-CL')}` : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden card-hover">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC' }} className="border-b border-slate-200">
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Proyecto</th>
                <th className="text-left px-3 py-3 text-slate-600 font-medium">Implementador</th>
                <th className="text-center px-3 py-3 text-slate-600 font-medium cursor-pointer select-none" onClick={() => toggleSort('meetings')}>
                  Reuniones <SortIcon field="meetings" />
                </th>
                <th className="text-center px-3 py-3 text-slate-600 font-medium cursor-pointer select-none" onClick={() => toggleSort('totalHours')}>
                  Horas <SortIcon field="totalHours" />
                </th>
                <th className="text-center px-3 py-3 text-slate-600 font-medium cursor-pointer select-none" onClick={() => toggleSort('calendarDays')}>
                  Días calendario <SortIcon field="calendarDays" />
                </th>
                <th className="text-center px-3 py-3 text-slate-600 font-medium">Eficiencia</th>
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
                  <td className="px-3 py-3 text-center text-slate-600">
                    {p.calendarDays != null ? `${p.calendarDays}d` : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <EfficiencyBadge calendarDays={p.calendarDays} totalHours={p.totalHours} />
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
function KpiCard({ icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 card-hover">
      <div className="flex items-center gap-2 text-sm mb-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color: BRAND.navy }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
