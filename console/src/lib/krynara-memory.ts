/**
 * KRYNARA persistent memory — IndexedDB (idb-keyval stores) with localStorage fallback.
 * Restores chats, devices, logs, stats, world filters, search history on load.
 */
import { createStore, get } from 'idb-keyval';
import { canWrite } from '@/services/quotaManager';
import { getKrynaraItem, setKrynaraItem } from '@/services/persistentStorage';

const DB_NAME = 'krynara-os-db';
const STORE_NAME = 'keyval-store';
export type MemoryKey =
  | 'chats' | 'messages' | 'devices' | 'logs' | 'stats'
  | 'worldFilters' | 'whatsappAuth' | 'searchHistory' | 'aiGenerations';

const store = createStore(DB_NAME, STORE_NAME);

const lsKey = (key: MemoryKey) => `krynara-mem:${key}`;

function memoryAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

const hasIdb = memoryAvailable();

export async function initDB(): Promise<void> {
  if (!hasIdb || !navigator.storage?.persist) return;
  await navigator.storage.persist();
}

export async function saveMemory(key: MemoryKey, value: unknown): Promise<void> {
  if (hasIdb) {
    await setKrynaraItem('memory', key, value);
    return;
  }

  const serialized = JSON.stringify(value);
  if (!await canWrite(new Blob([serialized]).size)) {
    throw new Error('KRYNARA storage is at its 20GB limit. Export or move data before saving more.');
  }
  localStorage.setItem(lsKey(key), serialized);
}

export async function loadMemory<T>(key: MemoryKey, fallback: T): Promise<T> {
  if (hasIdb) {
    const value = await getKrynaraItem<T | undefined>('memory', key, undefined);
    if (value !== undefined) return value;
    const legacyValue = await get<T | undefined>(key, store);
    if (legacyValue !== undefined) {
      await setKrynaraItem('memory', key, legacyValue);
      return legacyValue;
    }
  }
  const raw = localStorage.getItem(lsKey(key));
  return raw ? (JSON.parse(raw) as T) : fallback;
}

export async function saveLog(entry: string): Promise<void> {
  const logs = await getKrynaraItem<string[]>('logs', 'entries', []);
  logs.unshift(`[${new Date().toISOString()}] ${entry}`);
  await setKrynaraItem('logs', 'entries', logs.slice(0, 200));
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
