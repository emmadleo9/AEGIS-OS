/** NVIDIA NIM client config — key injected from YOUR account via .env.local (offline-mode fallback built in). */
const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;

export const NVIDIA_API_KEY =
  env.VITE_NVIDIA_API_KEY ?? env.NVIDIA_API_KEY ?? env.NEXT_PUBLIC_NVIDIA_KEY ?? '';

export const NVIDIA_OFFLINE = !NVIDIA_API_KEY;

export const NIM_BASE = 'https://integrate.api.nvidia.com/v1';

export async function nimChat(model: string, messages: Array<{ role: string; content: string }>): Promise<string> {
  if (NVIDIA_OFFLINE) throw new Error('offline-mode - using cached data');
  const response = await fetch('/api/nova/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'offline-mode - using cached data');
  return data.reply ?? '';
}
