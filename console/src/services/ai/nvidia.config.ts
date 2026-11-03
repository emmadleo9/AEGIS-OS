/** Backwards-compatible client helper; chat now uses the local Ollama provider. */
export const NVIDIA_OFFLINE = true;
export const NIM_BASE = '/api/nova/chat';

export async function nimChat(model: string, messages: Array<{ role: string; content: string }>): Promise<string> {
  const response = await fetch(NIM_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || 'qwen2.5:3b', messages }),
  });
  const data = await response.json() as { reply?: string; error?: string };
  if (!response.ok || data.error) throw new Error(data.error ?? `Local AI request failed (${response.status}).`);
  if (!data.reply?.trim()) throw new Error('The local model returned an empty response.');
  return data.reply;
}
