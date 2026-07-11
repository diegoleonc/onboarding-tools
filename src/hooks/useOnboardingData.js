import { useState, useEffect, useCallback, useMemo } from 'react'
import { DEFAULT_CALIBRATION } from '../utils/parsing'
import { fetchCalibration, fetchSnapshots } from '../utils/asanaApi'

// Unified data layer: joins /api/projects (fast, rich attributes)
// with /api/project-metrics (slower, DIIO effort) by project gid.
// Projects render immediately; effort fields hydrate when ready.
// Also exposes the calibrated estimation model and daily KPI snapshots.

const P_CACHE = 'onb_projects_v3' // v3: statusAgeDays, sentiment/odds, excerpts
const M_CACHE = 'onb_metrics_v3'
const C_CACHE = 'onb_calibration_v1'
const S_CACHE = 'onb_snapshots_v1'
const TTL = 5 * 60 * 1000
const SLOW_TTL = 60 * 60 * 1000 // calibración/snapshots: cambian a lo sumo 1 vez al día

function readCache(key, ttl = TTL) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (Date.now() - c.t > ttl) { sessionStorage.removeItem(key); return null }
    return c.d
  } catch { return null }
}

function writeCache(key, d) {
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d })) } catch { /* quota */ }
}

export function useOnboardingData() {
  const [projectsData, setProjectsData] = useState(() => readCache(P_CACHE))
  const [metricsData, setMetricsData] = useState(() => readCache(M_CACHE))
  const [loading, setLoading] = useState(!readCache(P_CACHE))
  const [metricsLoading, setMetricsLoading] = useState(!readCache(M_CACHE))
  const [error, setError] = useState(null)
  const [liveCalibration, setLiveCalibration] = useState(() => readCache(C_CACHE, SLOW_TTL))
  const [snapshots, setSnapshots] = useState(() => readCache(S_CACHE, SLOW_TTL) || [])

  // Modelo calibrado (compartido por Resumen/Proyectos); fallback estático si falla
  useEffect(() => {
    if (readCache(C_CACHE, SLOW_TTL)) return
    fetchCalibration()
      .then(c => { setLiveCalibration(c); writeCache(C_CACHE, c) })
      .catch(() => setLiveCalibration(null))
  }, [])

  // Serie de snapshots diarios (deltas "vs hace un mes"); opcional, no bloquea
  useEffect(() => {
    if (readCache(S_CACHE, SLOW_TTL)) return
    fetchSnapshots()
      .then(s => { setSnapshots(s || []); writeCache(S_CACHE, s || []) })
      .catch(() => setSnapshots([]))
  }, [])

  const fetchProjects = useCallback(async (force = false) => {
    if (!force) {
      const c = readCache(P_CACHE)
      if (c) { setProjectsData(c); setLoading(false); return }
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/projects')
      if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
      const json = await res.json()
      setProjectsData(json)
      writeCache(P_CACHE, json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMetrics = useCallback(async (force = false) => {
    if (!force) {
      const c = readCache(M_CACHE)
      if (c) { setMetricsData(c); setMetricsLoading(false); return }
    }
    setMetricsLoading(true)
    try {
      const res = await fetch('/api/project-metrics')
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()
      setMetricsData(json)
      writeCache(M_CACHE, json)
    } catch (err) {
      console.error('Metrics fetch failed:', err)
      // effort data is an enhancement — don't block the app on it
    } finally {
      setMetricsLoading(false)
    }
  }, [])

  useEffect(() => { fetchProjects(); fetchMetrics() }, [fetchProjects, fetchMetrics])

  const refresh = useCallback(() => {
    sessionStorage.removeItem(P_CACHE)
    sessionStorage.removeItem(M_CACHE)
    return Promise.all([fetchProjects(true), fetchMetrics(true)])
  }, [fetchProjects, fetchMetrics])

  // ---- join by gid ----
  const joined = useMemo(() => {
    const metricsByGid = new Map()
    for (const m of metricsData?.projects || []) metricsByGid.set(m.gid, m)
    const enrich = (p) => {
      const m = metricsByGid.get(p.gid)
      return {
        ...p,
        hasMetrics: !!m,
        meetings: m?.meetings ?? 0,
        totalMinutes: m?.totalMinutes ?? 0,
        totalHours: m?.totalHours ?? 0,
        daysSinceLastMeeting: m?.daysSinceLastMeeting ?? null,
        firstActivity: m?.firstActivity ?? null,
        lastActivity: m?.lastActivity ?? null,
        lastSuccessOdds: m?.lastSuccessOdds ?? null,
        lastSentiment: m?.lastSentiment ?? null,
        meetingDetails: m?.meetingDetails ?? [],
      }
    }
    return {
      active: (projectsData?.active || []).map(enrich),
      completed: (projectsData?.completed || []).map(enrich),
    }
  }, [projectsData, metricsData])

  return {
    active: joined.active,
    completed: joined.completed,
    all: useMemo(() => [...joined.active, ...joined.completed], [joined]),
    meta: projectsData?.meta || null,
    hasMetrics: !!metricsData,
    // calibración activa: la live si llegó, si no las fórmulas estáticas (mismos valores)
    calibration: liveCalibration?.segments ? liveCalibration : DEFAULT_CALIBRATION,
    calibrationLive: !!liveCalibration?.segments && liveCalibration.source === 'live',
    snapshots,
    loading,
    metricsLoading,
    error,
    refresh,
  }
}
