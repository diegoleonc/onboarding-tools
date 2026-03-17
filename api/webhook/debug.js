// In-memory store for the last 20 raw webhook payloads
// This resets on cold starts but persists across warm invocations
const recentPayloads = globalThis.__diioDebugPayloads || [];
globalThis.__diioDebugPayloads = recentPayloads;

export function storePayload(body) {
  const entry = {
    receivedAt: new Date().toISOString(),
    id: body.id,
    name: body.name,
    action: body.action,
    rawSentiment: body.tracker_values?.sentiment,
    allTrackerKeys: body.tracker_values ? Object.keys(body.tracker_values) : [],
    // Store a compact version of tracker_values showing just the sentiment-related data
    trackerValuesSnapshot: {},
  };

  // Capture ALL tracker value keys and their types/values (not full text, just sentiment-relevant)
  if (body.tracker_values) {
    for (const [key, val] of Object.entries(body.tracker_values)) {
      if (typeof val === 'object' && val !== null) {
        entry.trackerValuesSnapshot[key] = {
          type: typeof val,
          hasValue: 'value' in val,
          value: val.value !== undefined ? val.value : undefined,
          valueType: val.value !== undefined ? typeof val.value : undefined,
          keys: Object.keys(val),
          // If value is a string longer than 50 chars, truncate for readability
          valueTruncated: typeof val.value === 'string' && val.value.length > 50
            ? val.value.substring(0, 50) + '...'
            : val.value,
        };
      } else {
        entry.trackerValuesSnapshot[key] = {
          type: typeof val,
          value: val,
        };
      }
    }
  }

  recentPayloads.unshift(entry);
  if (recentPayloads.length > 20) recentPayloads.pop();
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Return stored payloads
    const meetingId = req.query.id;
    if (meetingId) {
      const match = recentPayloads.find(p => p.id === meetingId);
      if (match) {
        return res.status(200).json(match);
      }
      return res.status(404).json({ error: 'Meeting not found in recent payloads', stored: recentPayloads.map(p => p.id) });
    }
    return res.status(200).json({
      count: recentPayloads.length,
      payloads: recentPayloads,
    });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
