import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw, Video } from 'lucide-react'
import { useOnboardingData } from '../hooks/useOnboardingData'
import { statusOf, INK, BRAND, heatColor } from '../theme'
import { lastNWeeks, inRange, formatHours, daysSinceLabel } from '../utils/insights'
import {
  Card, PageHeader, StatTile, StatusBadge, Segmented, FilterSelect,
  SearchInput, AsanaLink, LoadingState, ErrorState, EmptyState, HydratingNote,
} from '../components/ui'

const N_WEEKS = 8

export default function Esfuerzo() {
  const { active, completed, hasMetrics, loading, metricsLoading, error, refresh } = useOnboardingData()
  const [searchParams, setSearchParams] = useSearchParams()
  const [order, setOrder] = useState('neglect')

  // Filtros en la URL: una vista filtrada se puede pegar como link en Slack
  const ownerFilter = searchParams.get('owner') || ''
  const search = searchParams.get('q') || ''
  const setParam = (key, value) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }
  const setOwnerFilter = (v) => setParam('owner', v)
  const setSearch = (v) => setParam('q', v)

  const weeks = useMemo(() => lastNWeeks(N_WEEKS), [])
  const owners = useMemo(() => [...new Set(active.map(p => p.owner).filter(Boolean))].sort(), [active])

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    const pool = active.filter(p => {
      if (ownerFilter && p.owner !== ownerFilter) return false
      if (s) {
        const haystack = `${p.name} ${p.company || ''} ${p.owner || ''} ${(p.channels || []).join(' ')}`.toLowerCase()
        if (!haystack.includes(s)) return false
      }
      return true
    })
    const built = pool.map(p => {
      const cells = weeks.map(w => {
        const ms = (p.meetingDetails || []).filter(m => inRange(m.date, w.monday, w.sunday))
        const minutes = ms.reduce((sum, m) => sum + (m.minutes || 0), 0)
        return { meetings: ms.length, hours: Math.round((minutes / 60) * 10) / 10 }
      })
      return { project: p, cells, totalHours: p.totalHours || 0 }
    })
    if (order === 'neglect') {
      built.sort((a, b) => {
        const av = a.project.daysSinceLastMeeting ?? 999
        const bv = b.project.daysSinceLastMeeting ?? 999
        return bv - av
      })
    } else {
      built.sort((a, b) => b.totalHours - a.totalHours)
    }
    return built
  }, [active, weeks, ownerFilter, search, order])

  const maxCellHours = useMemo(
    () => Math.max(1, ...rows.flatMap(r => r.cells.map(c => c.hours))),
    [rows]
  )

  const kpis = useMemo(() => {
    const cur = weeks[weeks.length - 1]
    const prev = weeks[weeks.length - 2]
    let curMeetings = 0, curMinutes = 0, prevMeetings = 0
    const activeNoHold = active.filter(p => statusOf(p) !== 'on_hold')
    let covered = 0
    for (const p of active) {
      for (const m of p.meetingDetails || []) {
        if (inRange(m.date, cur.monday, cur.sunday)) { curMeetings++; curMinutes += m.minutes || 0 }
        else if (prev && inRange(m.date, prev.monday, prev.sunday)) prevMeetings++
      }
    }
    for (const p of activeNoHold) {
      if ((p.meetingDetails || []).some(m => inRange(m.date, cur.monday, cur.sunday))) covered++
    }
    const neglected = activeNoHold.filter(p => p.daysSinceLastMeeting === null || p.daysSinceLastMeeting > 7).length
    return {
      curMeetings, prevMeetings,
      curHours: Math.round((curMinutes / 60) * 10) / 10,
      coverage: activeNoHold.length > 0 ? Math.round((covered / activeNoHold.length) * 100) : 0,
      covered, coverable: activeNoHold.length,
      neglected,
      weekLabel: cur.fullLabel,
    }
  }, [active, weeks])

  if (loading && active.length === 0 && completed.length === 0) return <LoadingState message="Cargando proyectos..." />
  if (error && active.length === 0) return <ErrorState error={error} onRetry={refresh} />
  if (!hasMetrics) {
    return (
      <div>
        <PageHeader title="Esfuerzo" subtitle="Tiempo efectivo por proyecto según reuniones DIIO" />
        <LoadingState message="Calculando métricas de esfuerzo DIIO (puede tomar hasta un minuto)..." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Esfuerzo" subtitle={`Tiempo efectivo por proyecto según reuniones DIIO · semana en curso (parcial): ${kpis.weekLabel}`}>
        <HydratingNote show={metricsLoading} />
        <button
          onClick={refresh}
          disabled={metricsLoading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E4E8F1] rounded-lg text-[13px] font-medium hover:bg-[#F7F9FC] transition-colors disabled:opacity-50 shadow-sm"
          style={{ color: BRAND.navy }}
        >
          <RefreshCw size={14} className={metricsLoading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile
          label="Cobertura esta semana"
          value={`${kpis.coverage}%`}
          sub={`${kpis.covered} de ${kpis.coverable} con reunión · semana parcial`}
          tone={kpis.coverage >= 60 ? 'good' : kpis.coverage >= 40 ? 'warn' : 'bad'}
        />
        <StatTile
          label="Reuniones esta semana"
          value={kpis.curMeetings}
          delta={kpis.prevMeetings > 0 || kpis.curMeetings > 0 ? kpis.curMeetings - kpis.prevMeetings : undefined}
          deltaGood={kpis.curMeetings >= kpis.prevMeetings}
          sub="vs semana anterior"
        />
        <StatTile label="Horas esta semana" value={formatHours(kpis.curHours)} sub="tiempo efectivo DIIO" />
        <StatTile
          label="Sin reunión +7d"
          value={kpis.neglected}
          sub="activos sin pausa"
          tone={kpis.neglected > 0 ? 'warn' : 'good'}
        />
      </div>

      {/* single filter row */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Segmented value={order} onChange={setOrder} options={[['neglect', 'Más descuidados'], ['hours', 'Más horas']]} />
        <FilterSelect value={ownerFilter} onChange={setOwnerFilter} options={owners} placeholder="Implementador" />
        <div className="flex-1 min-w-[180px] max-w-xs"><SearchInput value={search} onChange={setSearch} placeholder="Buscar proyecto..." /></div>
        <span className="text-xs ml-auto" style={{ color: INK.faint }}>{rows.length} proyectos activos</span>
      </div>

      <Card pad={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr className="border-b border-[#E4E8F1]" style={{ backgroundColor: '#F8FAFD' }}>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: INK.muted }}>Proyecto</th>
                <th className="px-2 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: INK.muted }}>Estado</th>
                {weeks.map(w => (
                  <th key={w.key} className="px-1 py-3 text-center text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: w.isCurrent ? BRAND.navy : INK.muted }} title={w.fullLabel}>
                    {w.label}
                  </th>
                ))}
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: INK.muted }}>Total</th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: INK.muted }}>Última</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ project: p, cells }) => (
                <tr key={p.gid} className="border-b border-[#F0F3F8] hover:bg-[#F8FAFD] transition-colors">
                  <td className="px-4 py-2.5 max-w-[240px]">
                    <p className="font-medium truncate text-[13px]" style={{ color: INK.primary }} title={p.name}>{p.company || p.name}</p>
                    <p className="text-[11px] truncate" style={{ color: INK.faint }}>{p.owner || 'Sin asignar'}</p>
                  </td>
                  <td className="px-2 py-2.5"><StatusBadge statusKey={statusOf(p)} /></td>
                  {cells.map((c, i) => {
                    const bg = heatColor(c.hours, maxCellHours)
                    return (
                      <td key={i} className="px-1 py-2.5 text-center">
                        {c.meetings > 0 ? (
                          <span
                            className="inline-flex items-center justify-center min-w-[38px] px-1.5 py-1 rounded-md text-[11px] font-semibold tabular-nums"
                            style={{ backgroundColor: bg, color: c.hours / maxCellHours > 0.55 ? '#FFFFFF' : '#2B4063' }}
                            title={`${weeks[i].fullLabel}: ${c.meetings} reuniones · ${formatHours(c.hours)}`}
                          >
                            {formatHours(c.hours)}
                          </span>
                        ) : (
                          <span className="inline-block w-[38px] py-1 rounded-md text-[11px]" style={{ backgroundColor: '#F5F7FB', color: '#C6CFDE' }}>·</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {p.meetings > 0 ? (
                      <span className="inline-flex items-center gap-1 font-medium" style={{ color: INK.primary }}>
                        <Video size={11} style={{ color: BRAND.blue }} /> {p.meetings} · {formatHours(p.totalHours)}
                      </span>
                    ) : <span style={{ color: INK.faint }}>—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <LastMeeting days={p.daysSinceLastMeeting} onHold={statusOf(p) === 'on_hold'} />
                  </td>
                  <td className="px-2 py-2.5 text-right"><AsanaLink href={p.permalink} /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={weeks.length + 5}><EmptyState message="No se encontraron proyectos" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-[11px] mt-2" style={{ color: INK.faint }}>
        Intensidad de color = horas de reunión DIIO esa semana. Semana actual: {weeks[weeks.length - 1].label}.
      </p>
    </div>
  )
}

function LastMeeting({ days, onHold }) {
  if (days === null || days === undefined) {
    if (onHold) return <span className="text-[11px]" style={{ color: INK.faint }}>Sin reuniones</span>
    return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FCE9E8', color: '#A02722' }}>Sin reuniones</span>
  }
  const tone = onHold
    ? { backgroundColor: '#EDF1F6', color: '#475569' }
    : days > 14 ? { backgroundColor: '#FCE9E8', color: '#A02722' }
    : days > 7 ? { backgroundColor: '#FCF0DE', color: '#92550A' }
    : { backgroundColor: '#E5F5EC', color: '#166B3D' }
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={tone}>{daysSinceLabel(days)}</span>
}
