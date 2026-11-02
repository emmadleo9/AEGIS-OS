/**
 * AEGIS persistent memory — IndexedDB (idb-keyval stores) with localStorage fallback.
 * Restores chats, devices, logs, stats, world filters, search history on load.
 */
import { createStore, get, set, getStore, setStore } from 'idb-keyval';

const DB_NAME = 'aegis-os-db';
const VERSION = 2;
export type MemoryKey =
  | 'chats' | 'messages' | 'devices' | 'logs' | 'stats'
  | 'worldFilters' | 'whatsappAuth' | 'searchHistory' | 'aiGenerations';

const store = createStore(DB_NAME, VERSION);

const lsKey = (key: MemoryKey) => `aegis-mem:${key}`;

function memoryAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB.open(DB_NAME, VERSION) !== null;
  } catch {
    return false;
  }
}

const hasIdb = memoryAvailable();

export async function initDB(): Promise<void> {
  if (hasIdb) {
    try {
      // request durable storage so the OS does not evict us
      if (navigator.storage?.persist) void navigator.storage.persist();
    } catch {
      /* storage persistence is best effort */
    }
  }
}

export async function saveMemory(key: MemoryKey, value: unknown): Promise<void> {
  try {
    if (hasIdb) await set(key, value, store);
    else localStorage.setItem(lsKey(key), JSON.stringify(value));
  } catch (reason) {
    console.warn(`[aegis-memory] save ${key} failed`, reason);
  }
}

export async function loadMemory<T>(key: MemoryKey, fallback: T): Promise<T> {
  try {
    if (hasIdb) {
      const value = await get<T>(key, store);
      return value ?? fallback;
    }
    const raw = localStorage.getItem(lsKey(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (reason) {
    console.warn(`[aegis-memory] load ${key} failed`, reason);
    return fallback;
  }
}

export async function saveLog(entry: string): Promise<void> {
  const logs = await loadMemory<string[]>('logs', []);
  logs.unshift(`[${new Date().toISOString()}] ${entry}`);
  await saveMemory('logs', logs.slice(0, 200));
}

export async function saveStatsPoint(point: Record<string, number>): Promise<void> {
  const stats = await loadMemory<Record<string, number>[]>('stats', []);
  stats.push({ ...point, t: Date.now() });
  await saveMemory('stats', stats.slice(-500));
}

export async function pushSearchHistory(query: string): Promise<void> {
  const history = await loadMemory<string[]>('searchHistory', []);
  const next = [query, ...history.filter((item) => item !== query)].slice(0, 30);
  await saveMemory('searchHistory', next);
}

export async function memoryStats(): Promise<Record<MemoryKey, number>> {
  const keys: MemoryKey[] = ['chats', 'messages', 'devices', 'logs', 'stats', 'worldFilters', 'whatsappAuth', 'searchHistory', 'aiGenerations'];
  const counts = await Promise.all(keys.map(async (key) => {
    const value = await loadMemory<unknown[]>(key, []);
    return Array.isArray(value) ? value.length : 0;
  }));
  return Object.fromEntries(keys.map((key, index) => [key, counts[index]])) as Record<MemoryKey, number>;
}

export { getStore as getAegisStore, setStore as setAegisStore };
