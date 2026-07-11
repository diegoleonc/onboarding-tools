import { useMemo, useState } from 'react'
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { useOnboardingData } from '../hooks/useOnboardingData'
import { statusOf, INK, BRAND } from '../theme'
import {
  buildAttention, weeklyCoverage, ownerLoad, monthlyCloses,
  effortWindow, lastNWeeks, formatHours,
} from '../utils/insights'
import {
  Card, PageHeader, StatTile, StatusBadge, TipoBadge, Chip,
  OwnerDot, AsanaLink, LoadingState, ErrorState, EmptyState, HydratingNote,
} from '../components/ui'
import { CoverageChart, PipelineChart, ClosesChart, LoadBar } from '../components/charts'
import { CAT } from '../theme'

const DAY = 24 * 60 * 60 * 1000

export default function Resumen() {
  const { active, completed, all, meta, hasMetrics, loading, metricsLoading, error, refresh } = useOnboardingData()
  const [showAllAttention, setShowAllAttention] = useState(false)

  const weeks = useMemo(() => lastNWeeks(10), [])

  const attention = useMemo(() => buildAttention(active), [active])
  const coverage = useMemo(() => (hasMetrics ? weeklyCoverage(all, weeks) : []), [all, weeks, hasMetrics])
  const team = useMemo(() => ownerLoad(active), [active])
  const closes = useMemo(() => monthlyCloses(completed, 6), [completed])

  const kpis = useMemo(() => {
    const byStatus = { on_track: 0, at_risk: 0, off_track: 0, on_hold: 0, none: 0 }
    for (const p of active) byStatus[statusOf(p)] = (byStatus[statusOf(p)] || 0) + 1
    const risk = byStatus.at_risk + byStatus.off_track
    const neglected = hasMetrics
      ? active.filter(p => statusOf(p) !== 'on_hold' && (p.daysSinceLastMeeting === null || p.daysSinceLastMeeting > 7)).length
      : null
    const now = new Date()
    const e7 = effortWindow(active.concat(completed), new Date(now - 7 * DAY), now)
    const ePrev7 = effortWindow(active.concat(completed), new Date(now - 14 * DAY), new Date(now - 7 * DAY))
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    const closesQ = completed.filter(p => p.completedAt && new Date(p.completedAt) >= qStart).length
    return { total: active.length, byStatus, risk, neglected, e7, ePrev7, closesQ }
  }, [active, completed, hasMetrics])

  const pipeline = useMemo(() => {
    const rows = ['Setup', 'Upgrade', 'Reonboarding'].map(tipo => {
      const projs = active.filter(p => p.type === tipo)
      const row = { tipo, total: projs.length, on_track: 0, at_risk: 0, off_track: 0, on_hold: 0, none: 0 }
      for (const p of projs) row[statusOf(p)]++
      return row
    })
    return rows.filter(r => r.total > 0)
  }, [active])

  if (loading && active.length === 0) return <LoadingState message="Cargando datos de Asana..." />
  if (error && active.length === 0) return <ErrorState error={error} onRetry={refresh} />

  const visibleAttention = showAllAttention ? attention : attention.slice(0, 6)
  const onTrackPct = kpis.total > 0 ? Math.round((kpis.byStatus.on_track / kpis.total) * 100) : 0
  const maxLoad = Math.max(1, ...team.map(o => o.active))

  return (
    <div>
      <PageHeader
        title="Centro de comando"
        subtitle={meta?.fetchedAt ? `Datos en vivo desde Asana · actualizado ${new Date(meta.fetchedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : 'Datos en vivo desde Asana'}
      >
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

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <StatTile label="Proyectos activos" value={kpis.total} sub={`${kpis.byStatus.on_hold} en pausa`} />
        <StatTile label="En curso" value={`${onTrackPct}%`} sub={`${kpis.byStatus.on_track} de ${kpis.total}`} tone={onTrackPct >= 60 ? 'good' : undefined} />
        <StatTile label="Riesgo / atraso" value={kpis.risk} sub="estado Asana" tone={kpis.risk > 0 ? 'bad' : 'good'} />
        <StatTile
          label="Sin reunión +7d"
          value={kpis.neglected === null ? '…' : kpis.neglected}
          sub={kpis.neglected === null ? 'calculando' : 'activos sin pausa'}
          tone={kpis.neglected > 0 ? 'warn' : 'good'}
        />
        <StatTile
          label="Horas DIIO (7d)"
          value={hasMetrics ? formatHours(kpis.e7.hours) : '…'}
          sub={hasMetrics ? `${kpis.e7.meetings} reuniones` : 'calculando'}
          delta={hasMetrics && kpis.ePrev7.hours > 0 ? `${kpis.e7.hours >= kpis.ePrev7.hours ? '+' : ''}${Math.round((kpis.e7.hours - kpis.ePrev7.hours) * 10) / 10}h` : undefined}
          deltaGood={kpis.e7.hours >= kpis.ePrev7.hours}
        />
        <StatTile label="Cierres del trimestre" value={kpis.closesQ} sub={`${completed.length} históricos`} />
      </div>

      {/* Attention + pipeline */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mb-6">
        <Card
          title="Requiere atención"
          subtitle="Priorizado por estado, descuido y vencimiento"
          className="xl:col-span-3"
          action={<span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ backgroundColor: attention.length ? '#FCE9E8' : '#E5F5EC', color: attention.length ? '#A02722' : '#166B3D' }}>{attention.length} proyectos</span>}
        >
          {attention.length === 0 ? (
            <EmptyState message="Nada urgente — todo el pipeline bajo control" />
          ) : (
            <>
              <ul className="divide-y divide-[#F0F3F8] -mx-2">
                {visibleAttention.map(({ project: p, reasons, status }) => (
                  <li key={p.gid} className="flex items-center gap-3 px-2 py-3 hover:bg-[#F8FAFD] rounded-lg transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] font-semibold truncate" style={{ color: INK.primary }} title={p.name}>
                          {p.company || p.name}
                        </span>
                        <TipoBadge tipo={p.type} />
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {reasons.map((r, i) => <Chip key={i} kind={r.kind}>{r.text}</Chip>)}
                        <span className="text-[11px] ml-1" style={{ color: INK.faint }}>{p.owner || 'Sin asignar'}</span>
                      </div>
                    </div>
                    <StatusBadge statusKey={status} />
                    <AsanaLink href={p.permalink} />
                  </li>
                ))}
              </ul>
              {attention.length > 6 && (
                <button
                  onClick={() => setShowAllAttention(v => !v)}
                  className="mt-3 w-full flex items-center justify-center gap-1 text-[12px] font-medium py-2 rounded-lg hover:bg-[#F7F9FC] transition-colors"
                  style={{ color: BRAND.blue }}
                >
                  {showAllAttention ? <>Ver menos <ChevronUp size={14} /></> : <>Ver los {attention.length} <ChevronDown size={14} /></>}
                </button>
              )}
            </>
          )}
        </Card>

        <div className="xl:col-span-2 flex flex-col gap-4">
          <Card title="Pipeline activo" subtitle="Por tipo y estado">
            {pipeline.length > 0
              ? <PipelineChart data={pipeline} height={190} />
              : <EmptyState message="Sin proyectos activos" />}
          </Card>
          <Card title="Cierres por mes" subtitle="Proyectos completados, últimos 6 meses">
            <ClosesChart data={closes} height={170} />
          </Card>
        </div>
      </div>

      {/* Coverage + team */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card
          title="Cobertura semanal DIIO"
          subtitle="Proyectos activos con y sin reunión, últimas 10 semanas"
          className="xl:col-span-3"
        >
          {!hasMetrics
            ? <div className="h-[260px] flex items-center justify-center"><HydratingNote show label="Calculando esfuerzo DIIO..." /></div>
            : coverage.length > 0
              ? <CoverageChart data={coverage} height={260} />
              : <EmptyState message="Sin datos de cobertura" />}
        </Card>

        <Card title="Carga del equipo" subtitle="Proyectos activos y esfuerzo últimos 7 días" className="xl:col-span-2">
          {team.length === 0 ? (
            <EmptyState message="Sin proyectos asignados" />
          ) : (
            <ul className="space-y-4">
              {team.map((o) => (
                <li key={o.owner}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <OwnerDot name={o.owner} color={CAT[0]} />
                    <div className="flex items-center gap-3 text-[12px] flex-shrink-0" style={{ color: INK.muted }}>
                      <span className="font-semibold" style={{ color: INK.primary }}>{o.active} activos</span>
                      {hasMetrics && <span>{formatHours(o.hours7d)} · {o.meetings7d} reuniones</span>}
                    </div>
                  </div>
                  <LoadBar value={o.active} max={maxLoad} />
                  <div className="flex items-center gap-2 mt-1.5 text-[11px]" style={{ color: INK.faint }}>
                    {o.risk > 0 && <span style={{ color: '#A02722' }}>{o.risk} en riesgo/atraso</span>}
                    {hasMetrics && o.neglected > 0 && <span style={{ color: '#92550A' }}>{o.neglected} sin reunión +7d</span>}
                    {o.hold > 0 && <span>{o.hold} en pausa</span>}
                    {o.risk === 0 && o.neglected === 0 && <span style={{ color: '#166B3D' }}>Al día</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
