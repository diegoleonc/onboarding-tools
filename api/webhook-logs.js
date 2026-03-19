// API endpoint to read webhook logs from Upstash Redis
import { Redis } from '@upstash/redis';

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

export default async function handler(req, res) {
  // CORS headers for frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // DELETE: clear all logs or delete a single log by ID
  if (req.method === 'DELETE') {
    const redis = getRedis();
    if (!redis) return res.status(500).json({ error: 'Redis not configured' });
    try {
      const { logId } = req.query;
      if (logId) {
        // Delete a single log entry by finding it in the sorted set
        const rawLogs = await redis.zrange('webhook:logs', 0, -1);
        let removed = false;
        for (const entry of rawLogs) {
          const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry;
          if (parsed.id === logId) {
            await redis.zrem('webhook:logs', entry);
            removed = true;
            break;
          }
        }
        if (!removed) return res.status(404).json({ error: 'Log not found' });
        return res.status(200).json({ status: 'ok', message: `Log ${logId} deleted` });
      }
      // No logId = clear all
      await redis.del('webhook:logs');
      return res.status(200).json({ status: 'ok', message: 'All logs cleared' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const redis = getRedis();
  if (!redis) {
    return res.status(500).json({ error: 'Redis not configured' });
  }

  try {
    const { type, status, search, limit = '100', offset = '0' } = req.query;
    const limitNum = Math.min(parseInt(limit) || 100, 500);
    const offsetNum = parseInt(offset) || 0;

    // Get all logs from sorted set (newest first)
    const rawLogs = await redis.zrange('webhook:logs', 0, -1, { rev: true });

    // Parse and filter
    let logs = rawLogs.map(entry => {
      try {
        return typeof entry === 'string' ? JSON.parse(entry) : entry;
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Apply filters
    if (type && type !== 'all') {
      logs = logs.filter(l => l.type === type);
    }

    if (status === 'matched') {
      logs = logs.filter(l => l.projectMatch !== null);
    } else if (status === 'unmatched') {
      logs = logs.filter(l => l.projectMatch === null);
    } else if (status === 'error') {
      logs = logs.filter(l => !l.success);
    }

    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(l =>
        (l.name && l.name.toLowerCase().includes(q)) ||
        (l.projectMatch && l.projectMatch.toLowerCase().includes(q)) ||
        (l.details && l.details.toLowerCase().includes(q)) ||
        (l.contactNames && l.contactNames.some(c => c.toLowerCase().includes(q)))
      );
    }

    const total = logs.length;
    const paged = logs.slice(offsetNum, offsetNum + limitNum);

    return res.status(200).json({
      total,
      offset: offsetNum,
      limit: limitNum,
      logs: paged,
    });
  } catch (err) {
    console.error('Error reading webhook logs:', err);
    return res.status(500).json({ error: err.message });
  }
}
