import { studioRequest } from '@/services/studioRequest';

function readTavilyKey() {
  try {
    return window.localStorage.getItem('krynara_tavily_key')?.trim() || null;
  } catch {
    return null;
  }
}

export async function getRealTimeContext(query, { includeWeb = true } = {}) {
  if (typeof query !== 'string' || !query.trim()) {
    throw new Error('A question is required to gather real-time context.');
  }

  const data = await studioRequest('/api/realtime/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query.trim(), includeWeb, tavilyKey: readTavilyKey() }),
  });
  if (typeof data.context !== 'string' || !data.context.trim()) {
    throw new Error('The real-time context service returned no context.');
  }
  return data.context;
}
