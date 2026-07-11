// Motor de calibración en tiempo real.
// Recorre los 3 portfolios históricos de Asana, calcula la duración real (días hábiles)
// de cada proyecto completado y ajusta las fórmulas base + perChannel por segmento
// con regresión robusta (Theil-Sen). El resultado se cachea 24h en memoria.
// Además persiste en Redis las estimaciones elegidas al parametrizar (POST /
// GET ?estimations=1) para cerrar el ciclo estimado-vs-real.
import { Redis } from '@upstash/redis';

const ASANA_BASE = 'https://app.asana.com/api/1.0';

const ESTIMATIONS_KEY = 'ob:estimations';
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
const PORTFOLIOS = {
  setup: '1203602528347966',
  upgrade: '1203602528347970',
  reonboarding: '1203602528347974',
};

const EXCLUDE_KEYWORDS = ['PERFORMANCE', 'ACUERDO COMERCIAL', 'PARTNERSHIP', 'PRUEBA', 'DESARROLLO'];
const COMPLEX = ['VTEX', 'MAGENTO', 'WOOCOMMERCE', 'SHOPIFY', 'SLOT', 'API', 'AGREGADOR', 'PRESTASHOP', 'TIENDANUBE'];

// Fallback estático (calibración 2026-07-10, 1.083 proyectos)
const STATIC_SEGMENTS = {
  upgrade: { base: 7, perChannel: 3 },
  reonboarding: { base: 22, perChannel: 4 },
  starter: { base: 26, perChannel: 5 },
  pro: { base: 35, perChannel: 8 },
  gold: { base: 35, perChannel: 8 },
  advanced: { base: 30, perChannel: 8 },
  enterprise: { base: 38, perChannel: 8 },
  platinum: { base: 38, perChannel: 8 },
};

let cache = { data: null, ts: 0 };
const TTL_MS = 24 * 60 * 60 * 1000;

// ---------- parser (misma lógica que el frontend) ----------
function parseChannels(text) {
  const channels = [];
  for (const raw of text.split('/')) {
    const item = raw.trim();
    if (!item) continue;
    const m = item.match(/^(\d+)\s*(.+)$/);
    if (m) {
      for (let i = 0; i < parseInt(m[1]); i++) channels.push(m[2].trim().toUpperCase());
    } else {
      channels.push(item.toUpperCase());
    }
  }
  return channels;
}

function parsePlan(fullText) {
  const plans = [
    [['PLATINUM'], 'platinum'],
    [['ENTERPRISE', 'ENTREPRISE', 'ENTERPRICE', 'ENTERRPISE'], 'enterprise'],
    [['ADVANCED', 'ADVANCES'], 'advanced'],
    [['GOLD'], 'gold'],
    [['PRO ', 'PRO(', 'PRO-', 'PRO)', 'PRO.', 'PRO'], 'pro'],
    [['STARTER', 'SATARTER'], 'starter'],
  ];
  for (const [names, value] of plans) {
    if (names.some((n) => fullText.includes(n))) return value;
  }
  return 'starter';
}

function businessDays(d1, d2) {
  if (d2 < d1) return null;
  let days = 0;
  const cur = new Date(d1);
  while (cur < d2) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

// ---------- estadística ----------
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function quantile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  const k = (s.length - 1) * p;
  const f = Math.floor(k);
  const c = Math.min(f + 1, s.length - 1);
  return s[f] + (s[c] - s[f]) * (k - f);
}

function theilSen(pairs) {
  const slopes = [];
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      if (pairs[i][0] !== pairs[j][0]) {
        slopes.push((pairs[j][1] - pairs[i][1]) / (pairs[j][0] - pairs[i][0]));
      }
    }
  }
  if (!slopes.length) return null;
  const b = median(slopes);
  const a = median(pairs.map(([x, y]) => y - b * x));
  return { a, b };
}

// ---------- fetch ----------
async function fetchPortfolio(gid, headers) {
  let items = [];
  let offset = null;
  do {
    const url = new URL(`${ASANA_BASE}/portfolios/${gid}/items`);
    url.searchParams.set('opt_fields', 'name,created_at,completed,completed_at,start_on');
    url.searchParams.set('limit', '100');
    if (offset) url.searchParams.set('offset', offset);
    const resp = await fetch(url.toString(), { headers });
    const data = await resp.json();
    if (data.data) items = items.concat(data.data);
    offset = data.next_page?.offset || null;
  } while (offset);
  return items;
}

export default async function handler(req, res) {
  // POST: guardar la estimación elegida al parametrizar (feedback loop)
  if (req.method === 'POST') {
    const redis = getRedis();
    if (!redis) return res.status(503).json({ error: 'Redis not configured' });
    const { projectGid } = req.body || {};
    if (!projectGid) return res.status(400).json({ error: 'projectGid required' });
    try {
      await redis.hset(ESTIMATIONS_KEY, {
        [projectGid]: JSON.stringify({ ...req.body, savedAt: new Date().toISOString() }),
      });
      return res.status(200).json({ saved: true });
    } catch (err) {
      console.error('Estimation save error:', err);
      return res.status(500).json({ error: 'Failed to save estimation' });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // GET ?estimations=1: leer las estimaciones registradas
  if (req.query.estimations === '1') {
    const redis = getRedis();
    if (!redis) return res.status(503).json({ error: 'Redis not configured' });
    try {
      const raw = (await redis.hgetall(ESTIMATIONS_KEY)) || {};
      const estimations = {};
      for (const [gid, val] of Object.entries(raw)) {
        try { estimations[gid] = typeof val === 'string' ? JSON.parse(val) : val; } catch { /* skip corrupt */ }
      }
      return res.status(200).json({ estimations });
    } catch (err) {
      console.error('Estimation read error:', err);
      return res.status(500).json({ error: 'Failed to read estimations' });
    }
  }

  const pat = process.env.ASANA_PAT;
  if (!pat) return res.status(500).json({ error: 'ASANA_PAT not configured' });

  const force = req.query.force === '1';
  if (!force && cache.data && Date.now() - cache.ts < TTL_MS) {
    return res.status(200).json({ ...cache.data, cached: true });
  }

  try {
    const headers = { Authorization: `Bearer ${pat}` };
    const [setupItems, upgradeItems, reonbItems] = await Promise.all([
      fetchPortfolio(PORTFOLIOS.setup, headers),
      fetchPortfolio(PORTFOLIOS.upgrade, headers),
      fetchPortfolio(PORTFOLIOS.reonboarding, headers),
    ]);

    // dataset: [{segKey, nChannels, real, complex}]
    const rows = [];
    const collect = (items, portfolioType) => {
      for (const p of items) {
        const name = (p.name || '').trim();
        const full = name.toUpperCase();
        if (EXCLUDE_KEYWORDS.some((k) => full.includes(k))) continue;
        if (!p.completed || !p.completed_at) continue;
        const start = p.start_on ? new Date(p.start_on + 'T00:00:00Z') : p.created_at ? new Date(p.created_at) : null;
        const end = new Date(p.completed_at);
        if (!start || isNaN(start) || isNaN(end)) continue;
        const dur = businessDays(start, end);
        if (dur === null || dur < 0 || dur > 400) continue;
        const chMatch = name.match(/\(([^)]+)\)/);
        if (!chMatch) continue;
        const channels = parseChannels(chMatch[1]);
        if (!channels.length) continue;
        const isComplex = channels.some((ch) => COMPLEX.some((c) => ch.includes(c)));
        let segKey;
        if (portfolioType === 'upgrade') segKey = 'upgrade';
        else if (portfolioType === 'reonboarding') segKey = 'reonboarding';
        else segKey = parsePlan(full);
        const q = `${end.getUTCFullYear()}-Q${Math.floor(end.getUTCMonth() / 3) + 1}`;
        rows.push({ segKey, n: channels.length, real: dur, complex: isComplex, quarter: q });
      }
    };
    collect(setupItems, 'setup');
    collect(upgradeItems, 'upgrade');
    collect(reonbItems, 'reonboarding');

    // grupos de ajuste (pro+gold y enterprise+platinum comparten fit por tamaño de muestra)
    const FIT_GROUPS = {
      starter: ['starter'],
      pro: ['pro', 'gold'],
      advanced: ['advanced'],
      enterprise: ['enterprise', 'platinum'],
      upgrade: ['upgrade'],
      reonboarding: ['reonboarding'],
    };
    const MIN_SAMPLE = 8;

    const segments = { ...STATIC_SEGMENTS };
    const perSegmentSamples = {};
    for (const [group, keys] of Object.entries(FIT_GROUPS)) {
      const pairs = rows.filter((r) => keys.includes(r.segKey)).map((r) => [r.n, r.real]);
      perSegmentSamples[group] = pairs.length;
      if (pairs.length < MIN_SAMPLE) continue; // fallback estático
      const fit = theilSen(pairs);
      if (!fit) continue;
      const base = Math.max(3, Math.round(fit.a));
      const perChannel = Math.max(0, Math.round(fit.b * 10) / 10);
      for (const key of keys) segments[key] = { base, perChannel };
    }

    // multiplicadores empíricos: P25 y P80 del ratio real/predicho
    const ratios = rows
      .map((r) => {
        const s = segments[r.segKey] || STATIC_SEGMENTS.starter;
        const pred = s.base + s.perChannel * r.n;
        return pred > 0 ? r.real / pred : null;
      })
      .filter((x) => x !== null && isFinite(x));
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const multipliers = ratios.length >= 50
      ? {
          optimista: clamp(Math.round(quantile(ratios, 0.25) * 100) / 100, 0.4, 0.8),
          conservador: clamp(Math.round(quantile(ratios, 0.8) * 100) / 100, 1.3, 2.2),
        }
      : { optimista: 0.6, conservador: 1.7 };

    // efecto integración compleja (residuo mediano, solo setup)
    const setupRows = rows.filter((r) => !['upgrade', 'reonboarding'].includes(r.segKey));
    const resid = (r) => {
      const s = segments[r.segKey] || STATIC_SEGMENTS.starter;
      return r.real - (s.base + s.perChannel * r.n);
    };
    const cxRes = setupRows.filter((r) => r.complex).map(resid);
    const nxRes = setupRows.filter((r) => !r.complex).map(resid);
    const complexExtraDays = cxRes.length >= 10 && nxRes.length >= 10
      ? clamp(Math.round(median(cxRes) - median(nxRes)), 0, 10)
      : 5;

    // Precisión del modelo: real vs predicho por segmento y trimestre (+ fila '(all)')
    const predict = (r) => {
      const s = segments[r.segKey] || STATIC_SEGMENTS.starter;
      return s.base + s.perChannel * r.n + (r.complex && !['upgrade', 'reonboarding'].includes(r.segKey) ? complexExtraDays : 0);
    };
    const trendGroups = {};
    for (const r of rows) {
      for (const seg of [r.segKey, '(all)']) {
        const key = `${r.quarter}|${seg}`;
        (trendGroups[key] = trendGroups[key] || []).push(r);
      }
    }
    const trend = Object.entries(trendGroups).map(([key, group]) => {
      const [quarter, segment] = key.split('|');
      const reals = group.map((r) => r.real);
      const preds = group.map(predict);
      const inBand = group.filter((r) => {
        const p = predict(r);
        return r.real >= p * multipliers.optimista && r.real <= p * multipliers.conservador;
      }).length;
      return {
        quarter,
        segment,
        n: group.length,
        medianReal: Math.round(median(reals)),
        medianPred: Math.round(median(preds)),
        inBandPct: Math.round((inBand / group.length) * 100),
      };
    }).sort((a, b) => a.quarter.localeCompare(b.quarter));

    const data = {
      segments,
      multipliers,
      complexExtraDays,
      sampleSize: rows.length,
      perSegmentSamples,
      trend,
      source: 'live',
      generatedAt: new Date().toISOString(),
    };
    cache = { data, ts: Date.now() };
    return res.status(200).json({ ...data, cached: false });
  } catch (err) {
    console.error('Calibration error:', err);
    return res.status(500).json({ error: 'Failed to compute calibration' });
  }
}
