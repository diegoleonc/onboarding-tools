import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Clock, MessageSquare, Video, RefreshCw, TrendingUp, Users, ArrowUpDown, ExternalLink, Search } from 'lucide-react'

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1']

function formatHours(hours) {
  if (hours === 0) return '0h'
  if (hours < 1) return `${Math.round(hours * 60)}m`
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function EfficiencyBadge({ calendarDays, totalHours }) {
  if (!calendarDays || calendarDays === 0 || totalHours === 0) return null
  const ratio = totalHours / (calendarDays * 8) * 100 // Assume 8h workday
  // This shows what % of calendar time was actual OB work
  return (
    <span className="text-xs text-slate-400" title={`${totalHours}h efectivas en ${calendarDays} días calendario`}>
      {ratio.toFixed(1)}% dedicación
    </span>
  )
}

export default function Esfuerzo() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortField, setSortField] = useState('totalHours')
  const [sortDir, setSortDir] = useState('desc')
  const [filter, setFilter] = useState('all') // all, active, completed
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
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-500">
          <RefreshCw size={20} className="animate-spin" />
          <span>Calculando métricas de esfuerzo...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        <p className="font-medium">Error al cargar métricas</p>
        <p className="text-sm mt-1">{error}</p>
        <button onClick={fetchMetrics} className="mt-3 text-sm bg-red-100 px-3 py-1 rounded-lg hover:bg-red-200">
          Reintentar
        </button>
      </div>
    )
  }

  if (!data) return null

  const { projects, totals, meta } = data

  // Filter and sort
  let filtered = projects
  if (filter === 'active') filtered = filtered.filter(p => !p.completed)
  if (filter === 'completed') filtered = filtered.filter(p => p.completed)
  if (search) {
    const s = search.toLowerCase()
    filtered = filtered.filter(p => p.name.toLowerCase().includes(s) || p.owner.toLowerCase().includes(s))
  }

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortField] ?? 0
    const bVal = b[sortField] ?? 0
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal
  })

  // Chart data: Top 15 by hours
  const topByHours = [...filtered]
    .filter(p => p.totalHours > 0)
    .sort((a, b) => b.totalHours - a.totalHours)
    .slice(0, 15)
    .map(p => ({
      name: p.name.split(' - ')[0].substring(0, 20),
      horas: p.totalHours,
      reuniones: p.meetings,
      conversaciones: p.conversations,
    }))

  // Owner aggregation
  const ownerMap = {}
  for (const p of filtered) {
    if (!ownerMap[p.owner]) ownerMap[p.owner] = { owner: p.owner, hours: 0, meetings: 0, conversations: 0, projects: 0 }
    ownerMap[p.owner].hours += p.totalHours
    ownerMap[p.owner].meetings += p.meetings
    ownerMap[p.owner].conversations += p.conversations
    ownerMap[p.owner].projects++
  }
  const ownerData = Object.values(ownerMap)
    .filter(o => o.hours > 0)
    .sort((a, b) => b.hours - a.hours)

  const ownerPieData = ownerData.map((o, i) => ({
    name: o.owner,
    value: Math.round(o.hours * 10) / 10,
    fill: COLORS[i % COLORS.length],
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
    <ArrowUpDown size={12} className={`inline ml-1 ${sortField === field ? 'text-blue-600' : 'text-slate-300'}`} />
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Esfuerzo por Proyecto</h1>
          <p className="text-sm text-slate-500 mt-1">
            Métricas de tiempo efectivo basadas en reuniones y conversaciones DIIO
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <Video size={16} className="text-blue-500" />
            Reuniones totales
          </div>
          <p className="text-2xl font-bold text-slate-800">{totals.meetings}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <MessageSquare size={16} className="text-purple-500" />
            Conversaciones
          </div>
          <p className="text-2xl font-bold text-slate-800">{totals.conversations}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <Clock size={16} className="text-emerald-500" />
            Tiempo total
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatHours(totals.totalHours)}</p>
          <p className="text-xs text-slate-400">{totals.totalMinutes} minutos</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <TrendingUp size={16} className="text-amber-500" />
            Promedio por proyecto
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {totals.projectsWithActivity > 0
              ? formatHours(Math.round(totals.totalHours / totals.projectsWithActivity * 10) / 10)
              : '—'}
          </p>
          <p className="text-xs text-slate-400">{totals.projectsWithActivity} proyectos con actividad</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar chart: Top projects by hours */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Top 15 — Horas por proyecto</h3>
          {topByHours.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topByHours} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'horas') return [`${value}h`, 'Horas']
                    if (name === 'reuniones') return [value, 'Reuniones']
                    return [value, 'Conversaciones']
                  }}
                />
                <Bar dataKey="horas" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
              Sin datos de duración disponibles
            </div>
          )}
        </div>

        {/* Pie chart: Hours by owner */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Distribución por implementador</h3>
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
                  <Tooltip formatter={(value) => `${value}h`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {ownerData.map((o, i) => (
                  <div key={o.owner} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-600">{o.owner}</span>
                    </div>
                    <div className="text-slate-500">
                      {formatHours(o.hours)} · {o.meetings}r · {o.conversations}c · {o.projects}p
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
              className={`px-3 py-1.5 ${filter === val ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar proyecto o implementador..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <span className="text-xs text-slate-400">
          {sorted.length} proyecto{sorted.length !== 1 ? 's' : ''}
          {meta?.fetchedAt ? ` · ${new Date(meta.fetchedAt).toLocaleTimeString('es-CL')}` : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Proyecto</th>
                <th className="text-left px-3 py-3 text-slate-600 font-medium">Implementador</th>
                <th className="text-center px-3 py-3 text-slate-600 font-medium cursor-pointer select-none" onClick={() => toggleSort('meetings')}>
                  Reuniones <SortIcon field="meetings" />
                </th>
                <th className="text-center px-3 py-3 text-slate-600 font-medium cursor-pointer select-none" onClick={() => toggleSort('conversations')}>
                  Conversaciones <SortIcon field="conversations" />
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
              {sorted.map((p, i) => (
                <tr key={p.gid} className={`border-b border-slate-100 hover:bg-slate-50 ${p.completed ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={p.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline font-medium truncate max-w-[280px]"
                        title={p.name}
                      >
                        {p.name.split(' - ')[0]}
                      </a>
                      <ExternalLink size={12} className="text-slate-300 flex-shrink-0" />
                      {p.completed && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Completado</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{p.owner}</td>
                  <td className="px-3 py-3 text-center">
                    {p.meetings > 0 ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                        <Video size={12} /> {p.meetings}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {p.conversations > 0 ? (
                      <span className="inline-flex items-center gap-1 text-purple-600 font-medium">
                        <MessageSquare size={12} /> {p.conversations}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center font-medium text-slate-800">
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
                  <td colSpan={7} className="text-center py-8 text-slate-400">
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
