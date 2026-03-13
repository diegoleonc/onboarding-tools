import { useState, useMemo } from 'react'
import { BarChart3, AlertTriangle, Users, Globe, Link2, Activity, Clock, TrendingUp, RefreshCw, Loader2, ExternalLink } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { useAsanaProjects } from '../hooks/useAsanaProjects'

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

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'sla', label: 'SLA & Tiempos', icon: Clock },
  { id: 'equipo', label: 'Equipo', icon: Users },
  { id: 'canales', label: 'Canales', icon: Link2 },
  { id: 'pais', label: 'País', icon: Globe },
]

const tooltipStyle = {
  contentStyle: { fontFamily: 'Poppins', borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }
}

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
        <Loader2 className="animate-spin" size={40} style={{ color: BRAND.blue }} />
        <p className="text-slate-500 text-sm">Cargando datos de Asana...</p>
      </div>
    )
  }

  if (error && active.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <AlertTriangle size={40} style={{ color: BRAND.red }} />
        <p className="font-medium" style={{ color: BRAND.red }}>Error al cargar datos</p>
        <p className="text-slate-500 text-sm max-w-md text-center">{error}</p>
        <button onClick={refresh} className="px-4 py-2 text-white rounded-lg text-sm hover:opacity-90 transition-opacity" style={{ backgroundColor: BRAND.navy }}>
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="brand-gradient rounded-2xl p-8 text-white relative overflow-hidden">
        <img src="/isotipo.png" alt="" className="absolute right-6 top-1/2 -translate-y-1/2 h-24 opacity-10" />
        <div className="flex items-center justify-between relative z-10">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>Onboarding Dashboard</h1>
            <p className="text-white/60 text-sm">
              Datos en tiempo real desde Asana
              {meta?.fetchedAt && (
                <span className="ml-2 text-white/40">
                  — Actualizado: {new Date(meta.fetchedAt).toLocaleTimeString('es-CL')}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors disabled:opacity-50 backdrop-blur-sm"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1.5 overflow-x-auto shadow-sm">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id ? 'text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
              style={activeTab === tab.id ? { backgroundColor: BRAND.navy } : {}}
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
        <KpiCard icon={<Activity size={20} />} label="Proyectos Activos" value={kpis.active} brandColor={BRAND.blue} />
        <KpiCard icon={<TrendingUp size={20} />} label="En Progreso" value={kpis.onTrack} brandColor={BRAND.green} />
        <KpiCard icon={<Clock size={20} />} label="En Pausa" value={kpis.onHold} brandColor={BRAND.yellow} />
        <KpiCard icon={<AlertTriangle size={20} />} label="Retrasados" value={kpis.offTrack} brandColor={BRAND.red} />
        <KpiCard icon={<BarChart3 size={20} />} label="Días Promedio" value={kpis.avgDays} brandColor={BRAND.pink} />
        <KpiCard icon={<Link2 size={20} />} label="Canales Totales" value={kpis.totalChannels} brandColor={BRAND.navy} />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 card-hover">
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
        <div className="rounded-2xl p-5 border" style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA' }}>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: BRAND.red }}>
            <AlertTriangle size={16} /> Alertas - Proyectos Retrasados / En Riesgo
          </h3>
          <div className="space-y-2">
            {filteredProjects.filter(p => ['off_track', 'at_risk'].includes(getStatusKey(p))).map(p => (
              <div key={p.gid} className="bg-white rounded-lg p-3 text-sm text-slate-700 flex items-center justify-between" style={{ borderLeft: `4px solid ${BRAND.red}` }}>
                <div>
                  <strong>{p.name}</strong> — {p.owner || 'Sin asignar'} — {p.totalChannels || p.channels?.length || 0} canales
                </div>
                {p.permalink && (
                  <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="hover:opacity-70 ml-2" style={{ color: BRAND.blue }}>
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
              <tr className="border-b border-slate-200" style={{ backgroundColor: '#F8FAFC' }}>
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
                  <td className="px-4 py-3 font-medium max-w-xs truncate" style={{ color: BRAND.navy }}>{p.name}</td>
                  <td className="px-4 py-3"><Badge type={p.type} /></td>
                  <td className="px-4 py-3"><StatusBadge statusKey={getStatusKey(p)} label={p.status} /></td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{p.owner || '-'}</td>
                  <td className="px-4 py-3"><Badge type={p.plan} /></td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{p.totalChannels || p.channels?.length || 0}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{p.days ?? '-'}</td>
                  <td className="px-4 py-3">
                    {p.permalink && (
                      <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="hover:opacity-70" style={{ color: BRAND.blue }}>
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
            <MetricBox label="P50 (Mediana)" value={setupP50} unit="días" color={BRAND.green} />
            <MetricBox label="P80" value={setupP80} unit="días" color={BRAND.orange} />
          </div>
        </Card>
        <Card title={`Upgrade SLA (${upgradeProjects.length} proyectos)`}>
          <div className="grid grid-cols-2 gap-4">
            <MetricBox label="P50 (Mediana)" value={upgradeP50 || '-'} unit="días" color={BRAND.green} />
            <MetricBox label="P80" value={upgradeP80 || '-'} unit="días" color={BRAND.orange} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Promedio por Tipo">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: 'Poppins' }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="dias" fill={BRAND.blue} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Promedio por Plan">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: 'Poppins' }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="dias" fill={BRAND.pink} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Proyectos Activos - Riesgo SLA">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200" style={{ backgroundColor: '#F8FAFC' }}>
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
                    <td className="px-4 py-3 font-medium max-w-xs truncate" style={{ color: BRAND.navy }}>{p.name}</td>
                    <td className="px-4 py-3"><Badge type={p.type} /></td>
                    <td className="px-4 py-3 text-slate-600">{p.days}</td>
                    <td className="px-4 py-3"><RiskBadge risk={risk} /></td>
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
              <StatRow label="En Progreso" value={o.onTrack} color={BRAND.green} />
              <StatRow label="En Pausa" value={o.onHold} color={BRAND.orange} />
              <StatRow label="Retrasados" value={o.offTrack} color={BRAND.red} />
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
              <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: 'Poppins' }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip {...tooltipStyle} />
              <Legend />
              <Bar dataKey="En Progreso" stackId="a" fill={BRAND.green} />
              <Bar dataKey="En Pausa" stackId="a" fill={BRAND.yellow} />
              <Bar dataKey="Retrasados" stackId="a" fill={BRAND.red} radius={[6, 6, 0, 0]} />
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
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fontFamily: 'Poppins' }} width={120} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" fill={BRAND.blue} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card title="Setup">
          <div className="text-4xl font-bold text-center py-4" style={{ color: BRAND.blue }}>
            {avgByType('Setup')}<span className="text-base font-normal text-slate-500 ml-2">canales/proyecto</span>
          </div>
        </Card>
        <Card title="Upgrade">
          <div className="text-4xl font-bold text-center py-4" style={{ color: BRAND.pink }}>
            {avgByType('Upgrade')}<span className="text-base font-normal text-slate-500 ml-2">canales/proyecto</span>
          </div>
        </Card>
        <Card title="Reonboarding">
          <div className="text-4xl font-bold text-center py-4" style={{ color: BRAND.orange }}>
            {avgByType('Reonboarding')}<span className="text-base font-normal text-slate-500 ml-2">canales/proyecto</span>
          </div>
        </Card>
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
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Días Promedio por País (Completados)">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'Poppins' }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="dias" fill={BRAND.navy} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Resumen por País">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200" style={{ backgroundColor: '#F8FAFC' }}>
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
                    <td className="px-4 py-3 font-medium" style={{ color: BRAND.navy }}>{country}</td>
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 card-hover">
      {title && <h3 className="text-base font-semibold mb-4" style={{ color: BRAND.navy }}>{title}</h3>}
      {children}
    </div>
  )
}

function KpiCard({ icon, label, value, brandColor }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center card-hover">
      <div className="inline-flex p-2 rounded-xl mb-3" style={{ backgroundColor: `${brandColor}15`, color: brandColor }}>
        {icon}
      </div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-3xl font-bold" style={{ color: BRAND.navy }}>{value}</div>
    </div>
  )
}

function MetricBox({ label, value, unit, color }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ backgroundColor: `${color}12` }}>
      <div className="text-xs font-semibold text-slate-500 uppercase mb-1">{label}</div>
      <div className="text-3xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs text-slate-500">{unit}</div>
    </div>
  )
}

function RiskBadge({ risk }) {
  const config = {
    red: { label: 'Alto', bg: `${BRAND.red}15`, color: BRAND.red },
    yellow: { label: 'Medio', bg: `${BRAND.orange}15`, color: BRAND.orange },
    green: { label: 'Bajo', bg: `${BRAND.green}15`, color: BRAND.green },
  }
  const c = config[risk] || config.green
  return (
    <span className="inline-block px-2.5 py-1 rounded-md text-xs font-semibold uppercase" style={{ backgroundColor: c.bg, color: c.color }}>
      {c.label}
    </span>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:border-transparent"
        style={{ '--tw-ring-color': BRAND.blue }}
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
    Setup: { bg: `${BRAND.blue}18`, color: BRAND.blue },
    Upgrade: { bg: `${BRAND.pink}18`, color: BRAND.pink },
    Reonboarding: { bg: `${BRAND.orange}18`, color: BRAND.orange },
    Starter: { bg: `${BRAND.navy}12`, color: BRAND.navy },
    Pro: { bg: `${BRAND.pink}12`, color: BRAND.pink },
    Advanced: { bg: '#e2e8f0', color: '#475569' },
    Enterprise: { bg: `${BRAND.orange}12`, color: BRAND.orange },
    Gold: { bg: `${BRAND.yellow}18`, color: '#92400e' },
    Platinum: { bg: '#cbd5e1', color: '#334155' },
  }
  const style = map[type] || { bg: '#f1f5f9', color: '#64748b' }
  return (
    <span className="inline-block px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: style.bg, color: style.color }}>
      {type || '-'}
    </span>
  )
}

function StatusBadge({ statusKey, label }) {
  const map = {
    on_track: { color: BRAND.green, fallback: 'En Progreso' },
    on_hold: { color: BRAND.yellow, fallback: 'En Pausa' },
    off_track: { color: BRAND.red, fallback: 'Retrasado' },
    at_risk: { color: BRAND.orange, fallback: 'En Riesgo' },
    complete: { color: BRAND.blue, fallback: 'Completado' },
  }
  const s = map[statusKey] || map.on_track
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: `${s.color}15`, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {label || s.fallback}
    </span>
  )
}

function StatRow({ label, value, color }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold" style={color ? { color } : { color: BRAND.navy }}>{value}</span>
    </div>
  )
}
