import { useMemo, useState, Fragment } from 'react'
import { RefreshCw, ArrowUpDown, ChevronRight, Video, CalendarDays } from 'lucide-react'
import { useOnboardingData } from '../hooks/useOnboardingData'
import { statusOf, INK, BRAND, STATUS } from '../theme'
import { slaReference, slaRisk, formatHours, daysSinceLabel, fmtShort } from '../utils/insights'
import {
  Card, PageHeader, StatusBadge, TipoBadge, Segmented, FilterSelect,
  SearchInput, AsanaLink, LoadingState, ErrorState, EmptyState, HydratingNote,
} from '../components/ui'

const SLA_TONE = {
  alto: { color: '#A02722', bg: '#FCE9E8', label: 'SLA alto' },
  medio: { color: '#92550A', bg: '#FCF0DE', label: 'SLA medio' },
  bajo: { color: '#166B3D', bg: '#E5F5EC', label: 'En plazo' },
}

export default function Proyectos() {
  const { active, completed, hasMetrics, loading, metricsLoading, error, refresh } = useOnboardingData()
  const [scope, setScope] = useState('active')
  const [filters, setFilters] = useState({ type: '', status: '', owner: '', country: '', plan: '' })
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('days')
  const [sortDir, setSortDir] = useState('desc')
  const [expanded, setExpanded] = useState(null)

  const ref = useMemo(() => slaReference(completed), [completed])

  const pool = useMemo(
    () => (scope === 'active' ? active : scope === 'completed' ? completed : [...active, ...completed]),
    [scope, active, completed]
  )

  const owners = useMemo(() => [...new Set([...active, ...completed].map(p => p.owner).filter(Boolean))].sort(), [active, completed])
  const countries = useMemo(() => [...new Set([...active, ...completed].map(p => p.country).filter(Boolean))].sort(), [active, completed])
  const plans = useMemo(() => [...new Set([...active, ...completed].map(p => p.plan).filter(Boolean))].sort(), [active, completed])

  const filtered = useMemo(() => {
    const s = search.toLowerCase()
    return pool.filter(p => {
      if (filters.type && p.type !== filters.type) return false
      if (filters.status && statusOf(p) !== filters.status) return false
      if (filters.owner && p.owner !== filters.owner) return false
      if (filters.country && p.country !== filters.country) return false
      if (filters.plan && p.plan !== filters.plan) return false
      if (s && !p.name.toLowerCase().includes(s)) return false
      return true
    })
  }, [pool, filters, search])

  const sorted = useMemo(() => {
    const strFields = ['name', 'owner', 'country', 'type', 'plan']
    return [...filtered].sort((a, b) => {
      const av = a[sortField], bv = b[sortField]
      if (strFields.includes(sortField)) {
        const cmp = String(av || '').localeCompare(String(bv || ''))
        return sortDir === 'desc' ? -cmp : cmp
      }
      return sortDir === 'desc' ? (bv ?? -1) - (av ?? -1) : (av ?? -1) - (bv ?? -1)
    })
  }, [filtered, sortField, sortDir])

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortField(field); setSortDir('desc') }
  }

  if (loading && pool.length === 0) return <LoadingState message="Cargando proyectos..." />
  if (error && pool.length === 0) return <ErrorState error={error} onRetry={refresh} />

  const thProps = { sortField, toggleSort }

  return (
    <div>
      <PageHeader title="Proyectos" subtitle={`${active.length} activos · ${completed.length} completados`}>
        <HydratingNote show={metricsLoading} />
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E4E8F1] rounded-lg text-[13px] font-medium hover:bg-[#F7F9FC] transition-colors disabled:opacity-50 shadow-sm"
          style={{ color: BRAND.navy }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </PageHeader>

      {/* single filter row */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Segmented value={scope} onChange={setScope} options={[['active', 'Activos'], ['completed', 'Completados'], ['all', 'Todos']]} />
        <FilterSelect value={filters.type} onChange={v => setFilters({ ...filters, type: v })} options={['Setup', 'Upgrade', 'Reonboarding']} placeholder="Tipo" />
        <FilterSelect
          value={filters.status}
          onChange={v => setFilters({ ...filters, status: v })}
          options={Object.entries(STATUS).filter(([k]) => k !== 'complete' && k !== 'none').map(([value, s]) => ({ value, label: s.label }))}
          placeholder="Estado"
        />
        <FilterSelect value={filters.owner} onChange={v => setFilters({ ...filters, owner: v })} options={owners} placeholder="Implementador" />
        <FilterSelect value={filters.country} onChange={v => setFilters({ ...filters, country: v })} options={countries} placeholder="País" />
        <FilterSelect value={filters.plan} onChange={v => setFilters({ ...filters, plan: v })} options={plans} placeholder="Plan" />
        <div className="flex-1 min-w-[180px] max-w-xs"><SearchInput value={search} onChange={setSearch} placeholder="Buscar proyecto..." /></div>
        <span className="text-xs ml-auto" style={{ color: INK.faint }}>{sorted.length} resultado{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      <Card pad={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E4E8F1]" style={{ backgroundColor: '#F8FAFD' }}>
                <th className="w-8" />
                <Th {...thProps} field="name">Proyecto</Th>
                <Th {...thProps} field="type">Tipo</Th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: INK.muted }}>Estado</th>
                <Th {...thProps} field="owner">Implementador</Th>
                <Th {...thProps} field="days" align="right">Días</Th>
                <Th {...thProps} field="meetings" align="right">Reuniones</Th>
                <Th {...thProps} field="totalHours" align="right">Horas</Th>
                <Th {...thProps} field="daysSinceLastMeeting" align="right">Última reunión</Th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const st = statusOf(p)
                const risk = !p.completed ? slaRisk(p, ref) : null
                const isOpen = expanded === p.gid
                return (
                  <Fragment key={p.gid}>
                    <tr
                      className={`border-b border-[#F0F3F8] hover:bg-[#F8FAFD] transition-colors cursor-pointer ${p.completed ? 'opacity-60' : ''}`}
                      onClick={() => setExpanded(isOpen ? null : p.gid)}
                    >
                      <td className="pl-3">
                        <ChevronRight size={14} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} style={{ color: INK.faint }} />
                      </td>
                      <td className="px-3 py-3 max-w-[280px]">
                        <p className="font-medium truncate" style={{ color: INK.primary }} title={p.name}>{p.company || p.name}</p>
                        <p className="text-[11px] truncate" style={{ color: INK.faint }}>
                          {[p.country, p.plan, p.totalChannels ? `${p.totalChannels} canales` : null].filter(Boolean).join(' · ')}
                        </p>
                      </td>
                      <td className="px-3 py-3"><TipoBadge tipo={p.type} /></td>
                      <td className="px-3 py-3"><StatusBadge statusKey={p.completed ? 'complete' : st} /></td>
                      <td className="px-3 py-3 text-[13px] whitespace-nowrap" style={{ color: INK.secondary }}>{p.owner || '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                        <span style={{ color: INK.primary, fontWeight: 500 }}>{p.days ?? '—'}</span>
                        {risk && risk !== 'bajo' && (
                          <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: SLA_TONE[risk].bg, color: SLA_TONE[risk].color }}>
                            {risk === 'alto' ? '>P80' : '>P50'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums" style={{ color: INK.secondary }}>
                        {p.hasMetrics ? (p.meetings || '—') : '…'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums" style={{ color: INK.secondary }}>
                        {p.hasMetrics ? (p.totalHours > 0 ? formatHours(p.totalHours) : '—') : '…'}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {p.completed ? <span style={{ color: INK.faint }}>—</span> : <LastMeeting days={p.daysSinceLastMeeting} pending={!p.hasMetrics} />}
                      </td>
                      <td className="px-3 py-3 text-right"><AsanaLink href={p.permalink} /></td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-[#F0F3F8]" style={{ backgroundColor: '#FAFBFE' }}>
                        <td colSpan={10} className="px-6 py-4">
                          <ProjectDetail project={p} refSla={ref} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={10}><EmptyState message="No se encontraron proyectos con esos filtros" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {!hasMetrics && (
        <p className="text-[11px] mt-2 text-center" style={{ color: INK.faint }}>
          Las columnas de reuniones y horas se completan al terminar el cálculo de esfuerzo DIIO.
        </p>
      )}
    </div>
  )
}

function Th({ sortField, toggleSort, field, children, align = 'left' }) {
  const isActive = sortField === field
  return (
    <th
      className={`px-3 py-3 ${align === 'right' ? 'text-right' : 'text-left'} text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap`}
      style={{ color: isActive ? BRAND.blue : INK.muted }}
      onClick={() => toggleSort(field)}
    >
      {children} <ArrowUpDown size={11} className="inline -mt-0.5" style={{ color: isActive ? BRAND.blue : '#D5DCE8' }} />
    </th>
  )
}

function LastMeeting({ days, pending }) {
  if (pending) return <span style={{ color: INK.faint }}>…</span>
  if (days === null || days === undefined) {
    return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FCE9E8', color: '#A02722' }}>Sin reuniones</span>
  }
  const tone = days > 14 ? { bg: '#FCE9E8', color: '#A02722' } : days > 7 ? { bg: '#FCF0DE', color: '#92550A' } : { bg: '#E5F5EC', color: '#166B3D' }
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={tone.bg ? { backgroundColor: tone.bg, color: tone.color } : {}}>{daysSinceLabel(days)}</span>
}

function ProjectDetail({ project: p, refSla }) {
  const r = refSla[p.type]
  const recent = [...(p.meetingDetails || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5)
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[13px]">
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: INK.muted }}>Alcance</h4>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(p.channels || []).length > 0
            ? p.channels.map((ch, i) => (
              <span key={i} className="px-2 py-0.5 rounded-md text-[11px] font-medium" style={{ backgroundColor: '#E8EDF7', color: '#35558F' }}>{ch}</span>
            ))
            : <span style={{ color: INK.faint }}>Sin canales detectados</span>}
        </div>
        <dl className="space-y-1" style={{ color: INK.secondary }}>
          <Row k="Plan" v={p.plan || '—'} />
          <Row k="País" v={p.country || '—'} />
          <Row k="Nombre completo" v={p.name} truncate />
        </dl>
      </div>
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: INK.muted }}>Tiempos</h4>
        <dl className="space-y-1" style={{ color: INK.secondary }}>
          <Row k="Inicio" v={p.start ? fmtShort(p.start) : (p.createdAt ? fmtShort(p.createdAt) : '—')} />
          <Row k="Fecha límite" v={p.end ? fmtShort(p.end) : '—'} />
          {p.completed && <Row k="Completado" v={p.completedAt ? fmtShort(p.completedAt) : '—'} />}
          <Row k="Días transcurridos" v={p.days ?? '—'} />
          {r?.n > 0 && <Row k={`Referencia ${p.type}`} v={`P50 ${r.p50}d · P80 ${r.p80}d`} />}
        </dl>
      </div>
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: INK.muted }}>Últimas reuniones DIIO</h4>
        {recent.length === 0 ? (
          <p style={{ color: INK.faint }}>Sin reuniones registradas</p>
        ) : (
          <ul className="space-y-1.5">
            {recent.map((m, i) => (
              <li key={i} className="flex items-center gap-2" style={{ color: INK.secondary }}>
                <Video size={12} style={{ color: BRAND.blue }} />
                <span className="tabular-nums">{fmtShort(m.date)}</span>
                <span style={{ color: INK.faint }}>·</span>
                <span>{m.minutes} min</span>
              </li>
            ))}
            {(p.meetingDetails || []).length > 5 && (
              <li className="flex items-center gap-2 text-[11px]" style={{ color: INK.faint }}>
                <CalendarDays size={12} />
                {p.meetingDetails.length} reuniones en total · {formatHours(p.totalHours)}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

function Row({ k, v, truncate }) {
  return (
    <div className="flex justify-between gap-4">
      <dt style={{ color: INK.muted }} className="flex-shrink-0">{k}</dt>
      <dd className={`text-right font-medium ${truncate ? 'truncate max-w-[220px]' : ''}`} style={{ color: INK.primary }} title={truncate ? String(v) : undefined}>{v}</dd>
    </div>
  )
}
