import { studioRequest } from '@/services/studioRequest';

function readKey(storageKey) {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored?.trim()) return stored.trim();
  } catch {
    return null;
  }
  return null;
}

export async function freePerplexitySearch(query, realtimeContext = '') {
  const tavilyKey = readKey('krynara_tavily_key');
  const nvidiaKey = readKey('krynara_nvidia_key');
  const openrouterKey = readKey('krynara_openrouter_key');

  const data = await studioRequest('/api/nova/free-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, tavilyKey, nvidiaKey, openrouterKey, realtimeContext }),
  }, 90_000);
  if (typeof data.reply !== 'string' || !data.reply.trim()) {
    throw new Error('Free web search returned an empty response.');
  }
  return { reply: data.reply, notice: data.notice };
}
