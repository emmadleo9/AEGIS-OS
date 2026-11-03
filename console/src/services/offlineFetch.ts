/**
 * Offline-mode fetch wrapper — replaces throw-on-fail with cached/mock fallbacks.
 * Any consumer gets { data, offline } and UI renders the "offline mode - using cached data" badge.
 */
export type OfflineResult<T> = { data: T; offline: boolean; error?: string };

const cache = new Map<string, unknown>();

export async function safeFetch<T>(url: string, mock: T, options: RequestInit = {}, ttlMs = 60_000): Promise<OfflineResult<T>> {
  try {
    const response = await fetch(url, { ...options, signal: options.signal ?? AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as T;
    cache.set(url, { data, at: Date.now() });
    return { data, offline: false };
  } catch (reason) {
    const cached = cache.get(url) as { data: T; at: number } | undefined;
    if (cached && Date.now() - cached.at < ttlMs * 6) {
      return { data: cached.data, offline: true, error: reason instanceof Error ? reason.message : String(reason) };
    }
    return { data: mock, offline: true, error: reason instanceof Error ? reason.message : String(reason) };
  }
}
