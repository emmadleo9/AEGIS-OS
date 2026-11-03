import { createStore, get, keys, set } from 'idb-keyval';
import { canWrite, checkLimit, invalidateDirectoryUsageCache, setQuotaDirectoryProvider } from '@/services/quotaManager';

const DATABASE = 'aegis-persistent-storage';
const STORE_NAMES = ['chats', 'logs', 'memory', 'config'];
const stores = Object.fromEntries(
  STORE_NAMES.map((name) => [name, createStore(`${DATABASE}-${name}`, `aegis_${name}`)]),
);
const DIRECTORY_HANDLE_KEY = 'data-directory-handle';
let activeDirectory = null;
let directoryName = '';
let persistentStorageGranted = false;
let directoryStatus = 'IndexedDB fallback active';
let writeQueue = Promise.resolve();
let storageReady;

setQuotaDirectoryProvider(async () => activeDirectory);

function readLegacyEntries(storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE);
    request.onerror = () => reject(request.error ?? new Error('Could not open the legacy AEGIS storage database.'));
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.close();
        resolve([]);
        return;
      }

      let transaction;
      try {
        transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const keyRequest = store.getAllKeys();
        const valueRequest = store.getAll();
        let entryKeys;
        let entryValues;
        keyRequest.onsuccess = () => { entryKeys = keyRequest.result; };
        valueRequest.onsuccess = () => { entryValues = valueRequest.result; };
        transaction.oncomplete = () => {
          database.close();
          resolve(entryKeys.map((key, index) => [key, entryValues[index]]));
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error(`Could not read legacy AEGIS store ${storeName}.`));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error(`Reading legacy AEGIS store ${storeName} was aborted.`));
        };
      } catch (error) {
        database.close();
        reject(error);
      }
    };
  });
}

function ensureStorageReady() {
  if (!storageReady) {
    storageReady = (async () => {
      for (const name of STORE_NAMES) {
        const store = stores[name];
        const legacyEntries = await readLegacyEntries(`aegis_${name}`);
        for (const [key, value] of legacyEntries) {
          if (await get(key, store) === undefined) await set(key, value, store);
        }
      }
    })();
  }
  return storageReady;
}

function assertStore(storeName) {
  const store = stores[storeName];
  if (!store || storeName === 'config') throw new Error(`Unknown AEGIS storage store: ${storeName}`);
  return store;
}

function serializedBytes(value) {
  return new Blob([JSON.stringify(value)]).size;
}

async function checkWriteSize(bytes) {
  const allowed = await canWrite(bytes);
  if (!allowed) {
    await checkLimit();
    throw new Error('AEGIS storage is at its 20GB limit. Export or move data before saving more.');
  }
}

async function directoryPermission(handle) {
  if (!handle) return 'unavailable';
  if (typeof handle.queryPermission !== 'function') return 'granted';
  return handle.queryPermission({ mode: 'readwrite' });
}

async function writeDirectorySnapshot(storeName, key, value) {
  const handle = activeDirectory;
  if (!handle) return '';
  const permission = await directoryPermission(handle);
  if (permission !== 'granted') {
    directoryStatus = 'Folder access needs to be re-authorized; IndexedDB remains active.';
    return directoryStatus;
  }

  const store = assertStore(storeName);
  const storeKeys = await keys(store);
  const snapshot = {};
  for (const storeKey of storeKeys) snapshot[String(storeKey)] = await get(storeKey, store);
  snapshot[String(key)] = value;
  const contents = JSON.stringify(snapshot, null, 2);
  const snapshotBytes = new Blob([contents]).size;
  await checkWriteSize(snapshotBytes);
  const fileHandle = await handle.getFileHandle(`${storeName}.json`, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(contents);
    await writable.close();
    invalidateDirectoryUsageCache();
  } catch (error) {
    await writable.abort?.();
    throw new Error(`IndexedDB saved the data, but the selected folder write failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  directoryStatus = `Saving to selected folder: ${directoryName}`;
  return '';
}

export async function initAegisStorage() {
  const warnings = [];
  await ensureStorageReady();
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    try {
      persistentStorageGranted = await navigator.storage.persist();
      if (!persistentStorageGranted) warnings.push('Browser durable-storage request was not granted.');
    } catch (error) {
      warnings.push(`Browser durable-storage request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const savedHandle = await get(DIRECTORY_HANDLE_KEY, stores.config);
    if (savedHandle) {
      directoryName = savedHandle.name || '';
      if (await directoryPermission(savedHandle) === 'granted') {
        activeDirectory = savedHandle;
        directoryStatus = `Saving to selected folder: ${directoryName}`;
      } else {
        directoryStatus = `Folder saved (${directoryName}); select it again to grant access.`;
      }
    }
  } catch (error) {
    warnings.push(`Could not restore the selected folder handle: ${error instanceof Error ? error.message : String(error)}`);
  }
  await checkLimit();
  return getAegisStorageStatus(warnings);
}

export async function selectAegisDataDirectory() {
  await ensureStorageReady();
  const picker = window.showDirectoryPicker;
  if (typeof picker !== 'function') {
    directoryStatus = 'This browser does not support folder access; IndexedDB fallback is active.';
    return getAegisStorageStatus();
  }

  const handle = await picker({ id: 'aegis-data', mode: 'readwrite' });
  if (handle.name.toUpperCase() !== 'AEGIS-OS-DATA') {
    throw new Error('Choose the AEGIS-OS-DATA folder on the D: drive to use the requested storage location.');
  }

  const permission = await handle.requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') throw new Error('Read/write permission was not granted for the selected AEGIS data folder.');
  await checkWriteSize(1024);
  await set(DIRECTORY_HANDLE_KEY, handle, stores.config);
  activeDirectory = handle;
  directoryName = handle.name;
  directoryStatus = `Saving to selected folder: ${directoryName}`;
  await checkLimit();
  return getAegisStorageStatus();
}

export function getAegisStorageStatus(extraWarnings = []) {
  return {
    persistentStorageGranted,
    directoryName,
    directorySelected: Boolean(activeDirectory),
    directoryStatus,
    warnings: extraWarnings,
  };
}

export async function getAegisItem(storeName, key, fallback) {
  await ensureStorageReady();
  const store = assertStore(storeName);
  const value = await get(key, store);
  return value === undefined ? fallback : value;
}

export async function setAegisItem(storeName, key, value) {
  await ensureStorageReady();
  const store = assertStore(storeName);
  const bytes = serializedBytes(value);
  await checkWriteSize(bytes);
  await set(key, value, store);
  const warning = await writeDirectorySnapshot(storeName, key, value);
  await checkLimit();
  return { warning };
}

export async function appendChatCompletion(chatId, messages, logEntry, memorySaver = true) {
  const operation = async () => {
    const current = await getAegisItem('chats', chatId, { archived: [], recent: [] });
    let archived = current.archived;
    let recent = [...current.recent, ...messages];
    if (memorySaver && recent.length > 100) {
      const archiveCount = recent.length - 50;
      archived = [...archived, ...recent.slice(0, archiveCount)];
      recent = recent.slice(archiveCount);
    } else if (!memorySaver && archived.length) {
      recent = [...archived, ...recent];
      archived = [];
    }
    const chatResult = await setAegisItem('chats', chatId, { archived, recent });
    const logs = await getAegisItem('logs', 'entries', []);
    const nextLogs = [...logs, logEntry].slice(-5000);
    const logResult = await setAegisItem('logs', 'entries', nextLogs);
    await setAegisItem('memory', 'last-chat', { chatId, updatedAt: new Date().toISOString() });
    return {
      recent,
      archivedCount: archived.length,
      warning: [chatResult.warning, logResult.warning].filter(Boolean).join(' '),
    };
  };

  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function loadChatHistory(chatId) {
  const record = await getAegisItem('chats', chatId, { archived: [], recent: [] });
  return {
    messages: record.recent,
    archivedCount: record.archived.length,
  };
}

export async function expandChatHistory(chatId) {
  const record = await getAegisItem('chats', chatId, { archived: [], recent: [] });
  if (!record.archived.length) return record.recent;
  const recent = [...record.archived, ...record.recent];
  await setAegisItem('chats', chatId, { archived: [], recent });
  return recent;
}

export async function compactChatHistory(chatId) {
  const record = await getAegisItem('chats', chatId, { archived: [], recent: [] });
  if (record.recent.length <= 100) {
    return { recent: record.recent, archivedCount: record.archived.length };
  }
  const archiveCount = record.recent.length - 50;
  const next = {
    archived: [...record.archived, ...record.recent.slice(0, archiveCount)],
    recent: record.recent.slice(archiveCount),
  };
  await setAegisItem('chats', chatId, next);
  return { recent: next.recent, archivedCount: next.archived.length };
}

export async function exportAllAegisMemory() {
  await ensureStorageReady();
  const output = {};
  for (const storeName of ['chats', 'logs', 'memory']) {
    const store = assertStore(storeName);
    const storeKeys = await keys(store);
    output[`aegis_${storeName}`] = {};
    for (const key of storeKeys) output[`aegis_${storeName}`][String(key)] = await get(key, store);
  }
  return output;
}

export async function importAegisMemory(data) {
  await ensureStorageReady();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Import file must contain an AEGIS memory JSON object.');
  }
  for (const storeName of ['chats', 'logs', 'memory']) {
    const items = data[`aegis_${storeName}`];
    if (items === undefined) continue;
    if (!items || typeof items !== 'object' || Array.isArray(items)) {
      throw new Error(`Imported aegis_${storeName} data must be an object.`);
    }
    const store = assertStore(storeName);
    for (const [key, value] of Object.entries(items)) {
      const bytes = serializedBytes(value);
      await checkWriteSize(bytes);
      await set(key, value, store);
      await writeDirectorySnapshot(storeName, key, value);
    }
  }
  await checkLimit();
}

export async function testAegisPersistence() {
  const key = 'persistence-test';
  const value = { test: true, at: new Date().toISOString() };
  await setAegisItem('memory', key, value);
  const result = await getAegisItem('memory', key, null);
  if (!result || result.test !== true || result.at !== value.at) {
    throw new Error('IndexedDB persistence test did not return the saved value.');
  }
  return result;
}
