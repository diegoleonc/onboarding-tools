import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, ChevronDown, ChevronUp, Copy, Check, Printer, ArrowRight } from 'lucide-react'
import { useOnboardingData } from '../hooks/useOnboardingData'
import { statusOf, INK, BRAND, STATUS } from '../theme'
import {
  buildAttention, weeklyCoverage, ownerLoad, monthlyCloses, monthlyFlow,
  ownerThroughput, cycleTimeTrend, estimationOutlook, closeForecast,
  effortWindow, lastNWeeks, formatHours, fmtShort, OUTLOOK_BUCKETS,
} from '../utils/insights'
import { buildExecutiveReport } from '../utils/report'
import {
  Card, PageHeader, StatTile, StatusBadge, TipoBadge, Chip,
  OwnerDot, AsanaLink, LoadingState, ErrorState, EmptyState, HydratingNote,
} from '../components/ui'
import { CoverageChart, PipelineChart, FlowChart, CycleTimeTrendChart, ForecastChart, LoadBar } from '../components/charts'
import { CAT } from '../theme'

const DAY = 24 * 60 * 60 * 1000

const OUTLOOK_COLORS = {
  onPlan: STATUS.on_track,
  near: STATUS.at_risk,
  over: { color: '#D97706', bg: '#FCF0DE', text: '#92550A' },
  overP80: STATUS.off_track,
}

export default function Resumen() {
  const {
    active, completed, all, meta, hasMetrics, calibration, calibrationLive,
    snapshots, loading, metricsLoading, error, refresh,
  } = useOnboardingData()
  const [showAllAttention, setShowAllAttention] = useState(false)
  const [expandedGid, setExpandedGid] = useState(null)
  const [copied, setCopied] = useState(false)
  const navigate = useNavigate()

  const weeks = useMemo(() => lastNWeeks(10), [])

  const attention = useMemo(() => buildAttention(active, { calibration }), [active, calibration])
  const coverage = useMemo(() => (hasMetrics ? weeklyCoverage(all, weeks) : []), [all, weeks, hasMetrics])
  const team = useMemo(() => ownerLoad(active), [active])
  const throughput = useMemo(() => ownerThroughput(completed, 90), [completed])
  const flow = useMemo(() => monthlyFlow(all, 6), [all])
  const trend = useMemo(() => cycleTimeTrend(completed, 6), [completed])
  const outlook = useMemo(() => estimationOutlook(active, calibration), [active, calibration])
  const forecast = useMemo(() => closeForecast(active, calibration, 10), [active, calibration])

  // ritmo real de cierres: promedio semanal de los últimos 3 meses completos
  const avgClosesPerWeek = useMemo(() => {
    const closes = monthlyCloses(completed, 4).slice(0, 3)
    const total = closes.reduce((s, b) => s + b.count, 0)
    return Math.round((total / 13) * 10) / 10
  }, [completed])

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
    const prevQStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 3, 1)
    const closesQ = completed.filter(p => p.completedAt && new Date(p.completedAt) >= qStart).length
    const closesPrevQ = completed.filter(p => {
      if (!p.completedAt) return false
      const d = new Date(p.completedAt)
      return d >= prevQStart && d < qStart
    }).length
    return { total: active.length, byStatus, risk, neglected, e7, ePrev7, closesQ, closesPrevQ }
  }, [active, completed, hasMetrics])

  // Delta vs snapshot de hace ~4 semanas (serie diaria propia en Redis)
  const monthAgo = useMemo(() => {
    if (!snapshots?.length) return null
    const target = new Date(new Date().getTime() - 28 * DAY).toISOString().slice(0, 10)
    let best = null
    for (const s of snapshots) {
      if (!best || Math.abs(new Date(s.date) - new Date(target)) < Math.abs(new Date(best.date) - new Date(target))) best = s
    }
    // solo si el snapshot más cercano está a ±10 días del objetivo
    if (best && Math.abs(new Date(best.date) - new Date(target)) <= 10 * DAY) return best
    return null
  }, [snapshots])

  const pipeline = useMemo(() => {
    const rows = ['Setup', 'Upgrade', 'Reonboarding', 'Sistemas'].map(tipo => {
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
  const throughputByOwner = new Map(throughput.map(t => [t.owner, t]))

  const dataAgeMin = meta?.fetchedAt ? Math.round((new Date() - new Date(meta.fetchedAt)) / 60000) : null

  const handleCopyReport = async () => {
    const teamForReport = team.map(o => ({ ...o, closes90: throughputByOwner.get(o.owner)?.closes ?? null }))
    const text = buildExecutiveReport({ kpis, attention, team: teamForReport, flow, outlook, hasMetrics, calibrationLive })
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lastMeetingOf = (p) => {
    const withExcerpt = (p.meetingDetails || []).filter(m => m.excerpt)
    return withExcerpt.length ? withExcerpt[withExcerpt.length - 1] : null
  }

  return (
    <div>
      <PageHeader
        title="Centro de comando"
        subtitle={dataAgeMin !== null
          ? `Datos en vivo desde Asana · hace ${dataAgeMin} min`
          : 'Datos en vivo desde Asana'}
      >
        <HydratingNote show={metricsLoading} />
        {dataAgeMin !== null && dataAgeMin > 10 && (
          <span className="text-[11px] font-medium px-2 py-1 rounded-md no-print" style={{ backgroundColor: '#FCF0DE', color: '#92550A' }}>
            Datos de hace {dataAgeMin} min
          </span>
        )}
        <button
          onClick={handleCopyReport}
          disabled={metricsLoading}
          title={metricsLoading ? 'Esperando métricas DIIO para no copiar cifras incompletas' : 'Copiar resumen ejecutivo para Slack/email'}
          className="no-print flex items-center gap-2 px-4 py-2 bg-white border border-[#E4E8F1] rounded-lg text-[13px] font-medium hover:bg-[#F7F9FC] transition-colors disabled:opacity-50 shadow-sm"
          style={{ color: BRAND.navy }}
        >
          {copied ? <Check size={14} style={{ color: STATUS.on_track.color }} /> : <Copy size={14} />}
          {copied ? 'Copiado' : 'Copiar resumen'}
        </button>
        <button
          onClick={() => window.print()}
          className="no-print flex items-center gap-2 px-3 py-2 bg-white border border-[#E4E8F1] rounded-lg text-[13px] font-medium hover:bg-[#F7F9FC] transition-colors shadow-sm"
          style={{ color: BRAND.navy }}
          title="Imprimir / guardar como PDF"
        >
          <Printer size={14} />
        </button>
        <button
          onClick={refresh}
          disabled={loading}
          className="no-print flex items-center gap-2 px-4 py-2 bg-white border border-[#E4E8F1] rounded-lg text-[13px] font-medium hover:bg-[#F7F9FC] transition-colors disabled:opacity-50 shadow-sm"
          style={{ color: BRAND.navy }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </PageHeader>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <StatTile
          label="Proyectos activos"
          value={kpis.total}
          sub={`${kpis.byStatus.on_hold} en pausa`}
          delta={monthAgo ? kpis.total - monthAgo.active : undefined}
          deltaNeutral
        />
        <StatTile label="En curso" value={`${onTrackPct}%`} sub={`${kpis.byStatus.on_track} de ${kpis.total}`} tone={onTrackPct >= 60 ? 'good' : undefined} />
        <StatTile
          label="Riesgo / atraso"
          value={kpis.risk}
          sub={monthAgo ? `vs ${monthAgo.risk} hace 4 sem` : 'estado Asana'}
          tone={kpis.risk > 0 ? 'bad' : 'good'}
          delta={monthAgo ? kpis.risk - monthAgo.risk : undefined}
          deltaGood={monthAgo ? kpis.risk - monthAgo.risk <= 0 : undefined}
          onClick={() => navigate('/proyectos?scope=active&status=risk')}
        />
        <StatTile
          label="Sin reunión +7d"
          value={kpis.neglected === null ? '…' : kpis.neglected}
          sub={kpis.neglected === null ? 'calculando' : 'activos sin pausa'}
          tone={kpis.neglected > 0 ? 'warn' : 'good'}
          delta={monthAgo?.neglected != null && kpis.neglected !== null ? kpis.neglected - monthAgo.neglected : undefined}
          deltaGood={monthAgo?.neglected != null && kpis.neglected !== null ? kpis.neglected - monthAgo.neglected <= 0 : undefined}
          onClick={() => navigate('/proyectos?scope=active&neglected=1')}
        />
        <StatTile
          label="Horas DIIO (7d)"
          value={hasMetrics ? formatHours(kpis.e7.hours) : '…'}
          sub={hasMetrics ? `${kpis.e7.meetings} reuniones` : 'calculando'}
          delta={hasMetrics && kpis.ePrev7.hours > 0 ? `${kpis.e7.hours >= kpis.ePrev7.hours ? '+' : ''}${Math.round((kpis.e7.hours - kpis.ePrev7.hours) * 10) / 10}h` : undefined}
          deltaNeutral
        />
        <StatTile
          label="Cierres del trimestre"
          value={kpis.closesQ}
          sub={`trimestre anterior: ${kpis.closesPrevQ}`}
          delta={kpis.closesQ - kpis.closesPrevQ}
          deltaGood={kpis.closesQ >= kpis.closesPrevQ}
        />
      </div>

      {/* Cartera vs plan calibrado */}
      <Card
        title="Cartera vs plan calibrado"
        subtitle={`Avance real (días hábiles) contra la duración esperada por segmento y canales · ${outlook.assessed} evaluables${outlook.unassessed > 0 ? ` · ${outlook.unassessed} sin canales/fecha` : ''}`}
        className="mb-6"
        action={
          <span
            className="text-[11px] font-medium px-2 py-1 rounded-md"
            style={calibrationLive
              ? { backgroundColor: '#E5F5EC', color: '#166B3D' }
              : { backgroundColor: '#F1F5F9', color: '#64748B' }}
            title={calibrationLive ? `Coeficientes recalculados desde Asana (${calibration.sampleSize} proyectos)` : 'Fórmulas estáticas calibradas (jul 2026)'}
          >
            {calibrationLive ? `Calibración live · ${calibration.sampleSize} proyectos` : 'Calibración estática'}
          </span>
        }
      >
        {outlook.assessed === 0 ? (
          <EmptyState message="Sin proyectos evaluables contra el plan" />
        ) : (
          <>
            <div className="flex h-3 rounded-full overflow-hidden mb-4" style={{ backgroundColor: '#EDF1F7' }}>
              {Object.entries(outlook.buckets).map(([key, arr]) => arr.length > 0 && (
                <div
                  key={key}
                  style={{ width: `${(arr.length / outlook.assessed) * 100}%`, backgroundColor: OUTLOOK_COLORS[key].color, marginRight: 2 }}
                  title={`${OUTLOOK_BUCKETS[key].label}: ${arr.length}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(outlook.buckets).map(([key, arr]) => (
                <button
                  key={key}
                  onClick={() => navigate(`/proyectos?scope=active&outlook=${key}`)}
                  className="no-print flex items-center justify-between px-4 py-3 rounded-xl border border-[#E4E8F1] hover:border-[#6681C6]/50 hover:shadow-sm transition-all text-left"
                >
                  <span className="flex items-center gap-2 text-[13px]" style={{ color: INK.secondary }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: OUTLOOK_COLORS[key].color }} />
                    {OUTLOOK_BUCKETS[key].label}
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-[15px]" style={{ color: INK.primary }}>
                    {arr.length}
                    <ArrowRight size={12} style={{ color: INK.faint }} />
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] mt-3" style={{ color: INK.faint }}>
              {outlook.pctOverPlan}% de la cartera evaluable ya superó su duración esperada · pausados excluidos
            </p>
          </>
        )}
      </Card>

      {/* Attention + pipeline */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mb-6">
        <Card
          title="Requiere atención"
          subtitle="Priorizado por estado, descuido, vencimiento, voz del cliente y plan calibrado"
          className="xl:col-span-3"
          action={<span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ backgroundColor: attention.length ? '#FCE9E8' : '#E5F5EC', color: attention.length ? '#A02722' : '#166B3D' }}>{attention.length} proyectos</span>}
        >
          {attention.length === 0 ? (
            <EmptyState message="Nada urgente — todo el pipeline bajo control" />
          ) : (
            <>
              <ul className="divide-y divide-[#F0F3F8] -mx-2">
                {visibleAttention.map(({ project: p, reasons, status }) => {
                  const lastMeeting = lastMeetingOf(p)
                  const isExpanded = expandedGid === p.gid
                  return (
                    <li key={p.gid} className="px-2 py-3 hover:bg-[#F8FAFD] rounded-lg transition-colors">
                      <div
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => setExpandedGid(isExpanded ? null : p.gid)}
                      >
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
                      </div>
                      {isExpanded && (
                        <div className="mt-3 ml-1 p-3 rounded-lg text-[12px]" style={{ backgroundColor: '#F8FAFD', color: INK.secondary }}>
                          {lastMeeting ? (
                            <>
                              <p className="font-semibold mb-1" style={{ color: INK.primary }}>
                                Última reunión · {fmtShort(lastMeeting.date)}{lastMeeting.minutes ? ` (${lastMeeting.minutes} min)` : ''}
                              </p>
                              <p className="leading-relaxed">{lastMeeting.excerpt}</p>
                            </>
                          ) : (
                            <p style={{ color: INK.faint }}>Sin resumen de reuniones DIIO disponible.</p>
                          )}
                          <button
                            onClick={() => navigate(`/proyectos?gid=${p.gid}`)}
                            className="no-print mt-2 inline-flex items-center gap-1 text-[12px] font-medium"
                            style={{ color: BRAND.blue }}
                          >
                            Ver ficha completa <ArrowRight size={12} />
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              {attention.length > 6 && (
                <button
                  onClick={() => setShowAllAttention(v => !v)}
                  className="no-print mt-3 w-full flex items-center justify-center gap-1 text-[12px] font-medium py-2 rounded-lg hover:bg-[#F7F9FC] transition-colors"
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
          <Card title="Cierres proyectados" subtitle={`Según plan calibrado, próximas 10 semanas${forecast.overdue > 0 ? ` · ${forecast.overdue} ya vencidos según plan` : ''}`}>
            {outlook.assessed > 0
              ? <ForecastChart data={forecast.weeks} avgPerWeek={avgClosesPerWeek} height={180} />
              : <EmptyState message="Sin proyectos evaluables" />}
          </Card>
        </div>
      </div>

      {/* Flujo + tendencia */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        <Card title="Flujo de cartera" subtitle="Aperturas vs cierres por mes y backlog resultante">
          <FlowChart data={flow} height={240} />
        </Card>
        <Card title="Tendencia de duración" subtitle="P50 de días a cierre por trimestre y tipo · puntos con n<5 suprimidos">
          {trend.some(t => t.Setup !== null || t.Upgrade !== null || t.Reonboarding !== null)
            ? <CycleTimeTrendChart data={trend} height={240} />
            : <EmptyState message="Muestra insuficiente para tendencia" />}
        </Card>
      </div>

      {/* Coverage + team */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card
          title="Cobertura semanal DIIO"
          subtitle="Proyectos activos con y sin reunión, últimas 10 semanas · semana en curso atenuada (parcial)"
          className="xl:col-span-3"
        >
          {!hasMetrics
            ? <div className="h-[260px] flex items-center justify-center"><HydratingNote show label="Calculando esfuerzo DIIO..." /></div>
            : coverage.length > 0
              ? <CoverageChart data={coverage} height={260} />
              : <EmptyState message="Sin datos de cobertura" />}
        </Card>

        <Card title="Carga y rendimiento del equipo" subtitle="Stock actual + cierres, duración y costo por cierre (90 días)" className="xl:col-span-2">
          {team.length === 0 ? (
            <EmptyState message="Sin proyectos asignados" />
          ) : (
            <ul className="space-y-4">
              {team.map((o) => {
                const t = throughputByOwner.get(o.owner)
                return (
                  <li key={o.owner}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <button
                        onClick={() => o.owner !== 'Sin asignar' && navigate(`/proyectos?scope=active&owner=${encodeURIComponent(o.owner)}`)}
                        className={`no-print ${o.owner !== 'Sin asignar' ? 'hover:opacity-70 transition-opacity' : 'cursor-default'}`}
                        title={o.owner !== 'Sin asignar' ? 'Ver sus proyectos' : undefined}
                      >
                        <OwnerDot name={o.owner} color={CAT[0]} />
                      </button>
                      <div className="flex items-center gap-3 text-[12px] flex-shrink-0" style={{ color: INK.muted }}>
                        <span className="font-semibold" style={{ color: INK.primary }}>{o.active} activos</span>
                        {hasMetrics && <span>{formatHours(o.hours7d)} · {o.meetings7d} reuniones</span>}
                      </div>
                    </div>
                    <LoadBar value={o.active} max={maxLoad} />
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] flex-wrap" style={{ color: INK.faint }}>
                      {o.risk > 0 && (
                        <button
                          onClick={() => o.owner !== 'Sin asignar' && navigate(`/proyectos?scope=active&owner=${encodeURIComponent(o.owner)}&status=risk`)}
                          className="no-print hover:underline"
                          style={{ color: '#A02722' }}
                        >
                          {o.risk} en riesgo/atraso
                        </button>
                      )}
                      {hasMetrics && o.neglected > 0 && <span style={{ color: '#92550A' }}>{o.neglected} sin reunión +7d</span>}
                      {o.hold > 0 && <span>{o.hold} en pausa</span>}
                      {o.onTrack > 0 && <span style={{ color: '#166B3D' }}>{o.onTrack} en curso</span>}
                      {t && (
                        <span className="ml-auto" style={{ color: INK.muted }}>
                          {t.closes} cierres/90d
                          {t.medianDays !== null && ` · P50 ${t.medianDays}d`}
                          {t.hoursPerClose !== null && ` · ${formatHours(t.hoursPerClose)}/cierre`}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
