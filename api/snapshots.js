// Snapshots diarios de KPIs ejecutivos en Redis (clave propia, separada de webhook:logs).
// GET            → serie histórica (cookie ob_key cuando APP_ACCESS_KEY está configurada)
// GET ?run=1     → computa y guarda el snapshot de hoy (lo invoca Vercel Cron, que manda
//                  Authorization: Bearer CRON_SECRET automáticamente si la env var existe)
import { Redis } from '@upstash/redis';

export const config = { maxDuration: 60 };

const SNAPSHOTS_KEY = 'ob:snapshots';

let _redis = null;
function getRedis() {
  if (!_redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return _redis;
}

// Mirror de statusOf del frontend (theme.js): statusType de Asana o custom field en texto
function statusKey(p) {
  if (p.statusType) return p.statusType;
  const s = p.status;
  if (s === 'En Progreso') return 'on_track';
  if (s === 'En Pausa') return 'on_hold';
  if (s === 'Atrasado') return 'off_track';
  if (s === 'En Riesgo') return 'at_risk';
  if (s === 'Completado') return 'complete';
  return 'none';
}

function baseUrl(req) {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || req.headers.host;
  return `https://${host}`;
}

async function computeSnapshot(req) {
  // Las llamadas internas pasan por el middleware: adjuntar la cookie del gate
  const headers = process.env.APP_ACCESS_KEY
    ? { cookie: `ob_key=${encodeURIComponent(process.env.APP_ACCESS_KEY)}` }
    : {};
  const base = baseUrl(req);

  const projectsRes = await fetch(`${base}/api/projects`, { headers });
  if (!projectsRes.ok) throw new Error(`projects ${projectsRes.status}`);
  const { active = [], completed = [] } = await projectsRes.json();

  // Métricas DIIO: tardan hasta 60s en frío — presupuesto de 45s, campos null si no llegan
  let metrics = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45000);
    const metricsRes = await fetch(`${base}/api/project-metrics`, { headers, signal: ctrl.signal });
    clearTimeout(t);
    if (metricsRes.ok) metrics = await metricsRes.json();
  } catch { /* snapshot parcial */ }

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { activeList: active, completed, metrics, now, monthKey };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const redis = getRedis();
  if (!redis) return res.status(503).json({ error: 'Redis not configured' });

  // ---- computar y guardar (cron) ----
  if (req.query.run === '1') {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const { activeList, completed, metrics, now, monthKey } = await computeSnapshot(req);

      const metricsByGid = new Map((metrics?.projects || []).map((m) => [m.gid, m]));
      const nonHold = activeList.filter((p) => statusKey(p) !== 'on_hold');
      const sevenAgo = new Date(now - 7 * 24 * 3600 * 1000);

      let neglected = null, meetings7d = null, hours7d = null;
      if (metrics) {
        neglected = 0; meetings7d = 0; hours7d = 0;
        for (const p of nonHold) {
          const m = metricsByGid.get(p.gid);
          const dslm = m?.daysSinceLastMeeting ?? null;
          if (dslm === null || dslm > 7) neglected++;
        }
        for (const p of activeList) {
          for (const md of metricsByGid.get(p.gid)?.meetingDetails || []) {
            if (new Date(md.date) >= sevenAgo) { meetings7d++; hours7d += (md.minutes || 0) / 60; }
          }
        }
        hours7d = Math.round(hours7d * 10) / 10;
      }

      const snapshot = {
        date: now.toISOString().slice(0, 10),
        active: activeList.length,
        risk: activeList.filter((p) => ['at_risk', 'off_track'].includes(statusKey(p))).length,
        hold: activeList.filter((p) => statusKey(p) === 'on_hold').length,
        noStatus: activeList.filter((p) => !p.statusType).length,
        neglected,
        meetings7d,
        hours7d,
        openedThisMonth: [...activeList, ...completed]
          .filter((p) => ((p.start || p.createdAt) || '').slice(0, 7) === monthKey).length,
        closedThisMonth: completed.filter((p) => (p.completedAt || '').slice(0, 7) === monthKey).length,
      };

      await redis.hset(SNAPSHOTS_KEY, { [snapshot.date]: JSON.stringify(snapshot) });
      return res.status(200).json({ saved: true, snapshot });
    } catch (err) {
      console.error('Snapshot error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ---- leer serie (frontend) ----
  const accessKey = process.env.APP_ACCESS_KEY;
  if (accessKey) {
    const cookie = req.headers.cookie || '';
    const m = cookie.match(/(?:^|;\s*)ob_key=([^;]+)/);
    if (!m || decodeURIComponent(m[1]) !== accessKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  try {
    const raw = (await redis.hgetall(SNAPSHOTS_KEY)) || {};
    const snapshots = Object.values(raw)
      .map((v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));
    return res.status(200).json({ snapshots });
  } catch (err) {
    console.error('Snapshot read error:', err);
    return res.status(500).json({ error: err.message });
  }
}
