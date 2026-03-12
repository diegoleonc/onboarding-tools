import { useState, useMemo } from 'react'
import { BarChart3, AlertTriangle, Users, Globe, Link2, Activity, Clock, TrendingUp, RefreshCw, Loader2, ExternalLink } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { useAsanaProjects } from '../hooks/useAsanaProjects'

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'sla', label: 'SLA & Tiempos', icon: Clock },
  { id: 'equipo', label: 'Equipo', icon: Users },
  { id: 'canales', label: 'Canales', icon: Link2 },
  { id: 'pais', label: 'País', icon: Globe },
]

const CHART_COLORS = ['#3b82f6', '#ec4899', '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#f97316', '#6366f1']

function getStatusKey(project) {
  return project.statusType || (
    project.status === 'En Progreso' ? 'on_track' :
    project.status === 'En Pausa' ? 'on_hold' :
    project.status === 'Atrasado' ? 'off_track' :
    project.status === 'En Riesgo' ? 'at_risk' :
    project.status === 'Completado' ? 'complete' : 'on_track'
  )
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  const [filters, setFilters] = useState({ type: '', status: '', owner: '', country: '', plan: '' })
  const { active, completed, meta, loading, error, refresh } = useAsanaProjects()

  const filteredProjects = useMemo(() => {
    return active.filter(p => {
      if (filters.type && p.type !== filters.type) return false
      if (filters.status && getStatusKey(p) !== filters.status) return false
      if (filters.owner && p.owner !== filters.owner) return false
      if (filters.country && p.country !== filters.country) return false
      if (filters.plan && p.plan !== filters.plan) return false
      return true
    })
  }, [active, filters])

  const kpis = useMemo(() => {
    const fp = filteredProjects
    const onTrack = fp.filter(p => getStatusKey(p) === 'on_track').length
    const onHold = fp.filter(p => getStatusKey(p) === 'on_hold').length
    const offTrack = fp.filter(p => ['off_track', 'at_risk'].includes(getStatusKey(p))).length
    const withDays = completed.filter(p => p.days > 0)
    const avgDays = withDays.length > 0 ? Math.round(withDays.reduce((s, p) => s + p.days, 0) / withDays.length) : 0
    const totalChannels = fp.reduce((s, p) => s + (p.totalChannels || p.channels?.length || 0), 0)
    return { active: fp.length, onTrack, onHold, offTrack, avgDays, totalChannels }
  }, [filteredProjects, completed])

  const owners = useMemo(() => [...new Set(active.map(p => p.owner).filter(Boolean))].sort(), [active])
  const countries = useMemo(() => [...new Set(active.map(p => p.country).filter(Boolean))].sort(), [active])

  if (loading && active.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={40} />
        <p className="text-slate-500 text-sm">Cargando datos de Asana...</p>
      </div>
    )
  }

  if (error && active.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <AlertTriangle className="text-red-500" size={40} />
        <p className="text-red-600 font-medium">Error al cargar datos</p>
        <p className="text-slate-500 text-sm max-w-md text-center">{error}</p>
        <button onClick={refresh} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">Onboarding Dashboard</h1>
            <p className="text-slate-400 text-sm">
              Datos en tiempo real desde Asana
              {meta?.fetchedAt && (
                <span className="ml-2 text-slate-500">
                  — Actualizado: {new Date(meta.fetchedAt).toLocaleTimeString('es-CL')}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1.5 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activeTab === 'overview' && <OverviewTab kpis={kpis} filters={filters} setFilters={setFilters} filteredProjects={filteredProjects} owners={owners} countries={countries} />}
      {activeTab === 'sla' && <SLATab active={active} completed={completed} />}
      {activeTab === 'equipo' && <EquipoTab active={active} completed={completed} />}
      {activeTab === 'canales' && <CanalesTab active={active} completed={completed} />}
      {activeTab === 'pais' && <PaisTab active={active} completed={completed} />}
    </div>
  )
}

// ===== OVERVIEW TAB =====
function OverviewTab({ kpis, filters, setFilters, filteredProjects, owners, countries }) {
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard icon={<Activity size={20} />} label="Proyectos Activos" value={kpis.active} color="blue" />
        <KpiCard icon={<TrendingUp size={20} />} label="En Progreso" value={kpis.onTrack} color="green" />
        <KpiCard icon={<Clock size={20} />} label="En Pausa" value={kpis.onHold} color="amber" />
        <KpiCard icon={<AlertTriangle size={20} />} label="Retrasados" value={kpis.offTrack} color="red" />
        <KpiCard icon={<BarChart3 size={20} />} label="Días Promedio" value={kpis.avgDays} color="purple" />
        <KpiCard icon={<Link2 size={20} />} label="Canales Totales" value={kpis.totalChannels} color="cyan" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <FilterSelect label="Tipo" value={filters.type} onChange={v => setFilters({ ...filters, type: v })} options={['Setup', 'Upgrade', 'Reonboarding']} />
          <FilterSelect label="Estado" value={filters.status} onChange={v => setFilters({ ...filters, status: v })} options={[
            { value: 'on_track', label: 'En Progreso' },
            { value: 'on_hold', label: 'En Pausa' },
            { value: 'off_track', label: 'Retrasado' },
            { value: 'at_risk', label: 'En Riesgo' },
          ]} />
          <FilterSelect label="Dueño" value={filters.owner} onChange={v => setFilters({ ...filters, owner: v })} options={owners} />
          <FilterSelect label="País" value={filters.country} onChange={v => setFilters({ ...filters, country: v })} options={countries} />
          <FilterSelect label="Plan" value={filters.plan} onChange={v => setFilters({ ...filters, plan: v })} options={['Starter', 'Pro', 'Advanced', 'Enterprise', 'Gold', 'Platinum']} />
        </div>
      </div>

      {/* Alerts */}
      {filteredProjects.filter(p => ['off_track', 'at_risk'].includes(getStatusKey(p))).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} /> Alertas - Proyectos Retrasados / En Riesgo
          </h3>
          <div className="space-y-2">
            {filteredProjects.filter(p => ['off_track', 'at_risk'].includes(getStatusKey(p))).map(p => (
              <div key={p.gid} className="bg-white border-l-4 border-red-500 rounded-lg p-3 text-sm text-slate-700 flex items-center justify-between">
                <div>
                  <strong>{p.name}</strong> — {p.owner || 'Sin asignar'} — {p.totalChannels || p.channels?.length || 0} canales
                </div>
                {p.permalink && (
                  <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 ml-2">
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects Table */}
      <Card title={`Proyectos Activos (${filteredProjects.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Proyecto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Dueño</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Canales</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Días</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase"></th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map(p => (
                <tr key={p.gid} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800 max-w-xs truncate">{p.name}</td>
                  <td className="px-4 py-3"><Badge type={p.type} /></td>
                  <td className="px-4 py-3"><StatusBadge statusKey={getStatusKey(p)} label={p.status} /></td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{p.owner || '-'}</td>
                  <td className="px-4 py-3"><Badge type={p.plan} /></td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{p.totalChannels || p.channels?.length || 0}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{p.days ?? '-'}</td>
                  <td className="px-4 py-3">
                    {p.permalink && (
                      <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ===== SLA TAB =====
function SLATab({ active, completed }) {
  const setupProjects = completed.filter(p => p.type === 'Setup' && p.days > 0)
  const upgradeProjects = completed.filter(p => p.type === 'Upgrade' && p.days > 0)

  const percentile = (arr, p) => {
    if (arr.length === 0) return 0
    const sorted = [...arr].sort((a, b) => a - b)
    const idx = Math.ceil(sorted.length * p / 100) - 1
    return sorted[Math.max(0, idx)]
  }

  const setupP50 = percentile(setupProjects.map(p => p.days), 50)
  const setupP80 = percentile(setupProjects.map(p => p.days), 80)
  const upgradeP50 = percentile(upgradeProjects.map(p => p.days), 50)
  const upgradeP80 = percentile(upgradeProjects.map(p => p.days), 80)

  const planGroups = {}
  completed.filter(p => p.days > 0).forEach(p => {
    if (!planGroups[p.plan]) planGroups[p.plan] = []
    planGroups[p.plan].push(p.days)
  })
  const planChartData = Object.entries(planGroups).map(([plan, days]) => ({
    name: plan, dias: Math.round(days.reduce((a, b) => a + b, 0) / days.length)
  }))

  const typeGroups = {}
  completed.filter(p => p.days > 0).forEach(p => {
    if (!typeGroups[p.type]) typeGroups[p.type] = []
    typeGroups[p.type].push(p.days)
  })
  const typeChartData = Object.entries(typeGroups).map(([type, days]) => ({
    name: type, dias: Math.round(days.reduce((a, b) => a + b, 0) / days.length)
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title={`Setup SLA (${setupProjects.length} proyectos)`}>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">P50 (Mediana)</div>
              <div className="text-3xl font-bold text-emerald-700">{setupP50}</div>
              <div className="text-xs text-slate-500">días</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">P80</div>
              <div className="text-3xl font-bold text-amber-700">{setupP80}</div>
              <div className="text-xs text-slate-500">días</div>
            </div>
          </div>
        </Card>
        <Card title={`Upgrade SLA (${upgradeProjects.length} proyectos)`}>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">P50 (Mediana)</div>
              <div className="text-3xl font-bold text-emerald-700">{upgradeP50 || '-'}</div>
              <div className="text-xs text-slate-500">días</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">P80</div>
              <div className="text-3xl font-bold text-amber-700">{upgradeP80 || '-'}</div>
              <div className="text-xs text-slate-500">días</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Promedio por Tipo">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="dias" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Promedio por Plan">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="dias" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Proyectos Activos - Riesgo SLA">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Proyecto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Días</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Riesgo</th>
              </tr>
            </thead>
            <tbody>
              {active.filter(p => p.days > 0).map(p => {
                const target = p.type === 'Setup' ? setupP50 : p.type === 'Upgrade' ? upgradeP50 : setupP50
                const limit = p.type === 'Setup' ? setupP80 : p.type === 'Upgrade' ? upgradeP80 : setupP80
                const risk = p.days > limit ? 'red' : p.days > target ? 'yellow' : 'green'
                return (
                  <tr key={p.gid} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800 max-w-xs truncate">{p.name}</td>
                    <td className="px-4 py-3"><Badge type={p.type} /></td>
                    <td className="px-4 py-3 text-slate-600">{p.days}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold uppercase ${
                        risk === 'red' ? 'bg-red-100 text-red-700' : risk === 'yellow' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {risk === 'red' ? 'Alto' : risk === 'yellow' ? 'Medio' : 'Bajo'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ===== EQUIPO TAB =====
function EquipoTab({ active, completed }) {
  const ownerNames = useMemo(() => [...new Set(active.map(p => p.owner).filter(Boolean))].sort(), [active])

  const ownerData = useMemo(() => ownerNames.map(owner => {
    const ownerActive = active.filter(p => p.owner === owner)
    const historical = completed.filter(p => p.owner === owner && p.days > 0)
    const avgDays = historical.length > 0 ? Math.round(historical.reduce((s, p) => s + p.days, 0) / historical.length) : 0
    return {
      name: owner,
      active: ownerActive.length,
      onTrack: ownerActive.filter(p => getStatusKey(p) === 'on_track').length,
      onHold: ownerActive.filter(p => getStatusKey(p) === 'on_hold').length,
      offTrack: ownerActive.filter(p => ['off_track', 'at_risk'].includes(getStatusKey(p))).length,
      avgDays,
    }
  }), [ownerNames, active, completed])

  const chartData = ownerData.map(o => ({
    name: o.name.split(' ')[0],
    'En Progreso': o.onTrack,
    'En Pausa': o.onHold,
    'Retrasados': o.offTrack,
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {ownerData.map(o => (
          <Card key={o.name} title={o.name}>
            <div className="space-y-3">
              <StatRow label="Proyectos Activos" value={o.active} />
              <StatRow label="En Progreso" value={o.onTrack} color="text-emerald-600" />
              <StatRow label="En Pausa" value={o.onHold} color="text-amber-600" />
              <StatRow label="Retrasados" value={o.offTrack} color="text-red-600" />
              <StatRow label="Promedio Histórico" value={`${o.avgDays} días`} />
            </div>
          </Card>
        ))}
      </div>

      <Card title="Proyectos por Dueño y Estado">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="En Progreso" stackId="a" fill="#22c55e" />
              <Bar dataKey="En Pausa" stackId="a" fill="#f59e0b" />
              <Bar dataKey="Retrasados" stackId="a" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}

// ===== CANALES TAB =====
function CanalesTab({ active, completed }) {
  const allProjects = useMemo(() => [...active, ...completed], [active, completed])

  const channelFreq = useMemo(() => {
    const freq = {}
    allProjects.forEach(p => {
      (p.channels || []).forEach(ch => { freq[ch] = (freq[ch] || 0) + 1 })
    })
    return freq
  }, [allProjects])

  const channelChartData = Object.entries(channelFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  const avgByType = (type) => {
    const projects = active.filter(p => p.type === type)
    return projects.length > 0 ? (projects.reduce((s, p) => s + (p.totalChannels || p.channels?.length || 0), 0) / projects.length).toFixed(1) : '0'
  }

  return (
    <div className="space-y-6">
      <Card title="Canales Más Frecuentes">
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={channelChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card title="Setup"><div className="text-4xl font-bold text-blue-700 text-center py-4">{avgByType('Setup')}<span className="text-base font-normal text-slate-500 ml-2">canales/proyecto</span></div></Card>
        <Card title="Upgrade"><div className="text-4xl font-bold text-pink-700 text-center py-4">{avgByType('Upgrade')}<span className="text-base font-normal text-slate-500 ml-2">canales/proyecto</span></div></Card>
        <Card title="Reonboarding"><div className="text-4xl font-bold text-amber-700 text-center py-4">{avgByType('Reonboarding')}<span className="text-base font-normal text-slate-500 ml-2">canales/proyecto</span></div></Card>
      </div>
    </div>
  )
}

// ===== PAIS TAB =====
function PaisTab({ active, completed }) {
  const countryActive = useMemo(() => {
    const counts = {}
    active.forEach(p => { if (p.country) counts[p.country] = (counts[p.country] || 0) + 1 })
    return counts
  }, [active])

  const pieData = Object.entries(countryActive).map(([name, value]) => ({ name, value }))

  const barData = useMemo(() => {
    const groups = {}
    completed.filter(p => p.days > 0 && p.country).forEach(p => {
      if (!groups[p.country]) groups[p.country] = []
      groups[p.country].push(p.days)
    })
    return Object.entries(groups).map(([name, days]) => ({
      name, dias: Math.round(days.reduce((a, b) => a + b, 0) / days.length)
    }))
  }, [completed])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Proyectos Activos por País">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Días Promedio por País (Completados)">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="dias" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Resumen por País">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">País</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Activos</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Días Promedio</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Canales Principales</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(countryActive).sort().map(([country, count]) => {
                const hist = completed.filter(p => p.country === country && p.days > 0)
                const avg = hist.length > 0 ? Math.round(hist.reduce((s, p) => s + p.days, 0) / hist.length) : 0
                const channels = new Set()
                active.filter(p => p.country === country).forEach(p => (p.channels || []).forEach(c => channels.add(c)))
                return (
                  <tr key={country} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{country}</td>
                    <td className="px-4 py-3 text-slate-600">{count}</td>
                    <td className="px-4 py-3 text-slate-600">{avg} días</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{[...channels].slice(0, 4).join(', ')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ===== SHARED COMPONENTS =====
function Card({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      {title && <h3 className="text-base font-semibold text-slate-800 mb-4">{title}</h3>}
      {children}
    </div>
  )
}

function KpiCard({ icon, label, value, color }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600', cyan: 'bg-cyan-50 text-cyan-600',
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center">
      <div className={`inline-flex p-2 rounded-xl mb-3 ${colorMap[color]}`}>{icon}</div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-3xl font-bold text-slate-800">{value}</div>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">Todos</option>
        {options.map(opt => typeof opt === 'string'
          ? <option key={opt} value={opt}>{opt}</option>
          : <option key={opt.value} value={opt.value}>{opt.label}</option>
        )}
      </select>
    </div>
  )
}

function Badge({ type }) {
  const map = {
    Setup: 'bg-blue-100 text-blue-800', Upgrade: 'bg-pink-100 text-pink-800',
    Reonboarding: 'bg-amber-100 text-amber-800', Starter: 'bg-indigo-100 text-indigo-800',
    Pro: 'bg-purple-100 text-purple-800', Advanced: 'bg-slate-200 text-slate-700',
    Enterprise: 'bg-orange-100 text-orange-800', Gold: 'bg-yellow-100 text-yellow-800',
    Platinum: 'bg-slate-300 text-slate-800',
  }
  return (
    <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold ${map[type] || 'bg-slate-100 text-slate-600'}`}>
      {type || '-'}
    </span>
  )
}

function StatusBadge({ statusKey, label }) {
  const map = {
    on_track: { bg: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', fallback: 'En Progreso' },
    on_hold: { bg: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', fallback: 'En Pausa' },
    off_track: { bg: 'bg-red-100 text-red-700', dot: 'bg-red-500', fallback: 'Retrasado' },
    at_risk: { bg: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', fallback: 'En Riesgo' },
    complete: { bg: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', fallback: 'Completado' },
  }
  const s = map[statusKey] || map.on_track
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label || s.fallback}
    </span>
  )
}

function StatRow({ label, value, color = 'text-slate-800' }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  )
}
