export const MAX_QUOTA_BYTES = 20 * 1024 * 1024 * 1024;

let directoryHandleProvider = async () => null;
let directoryUsageCache = { handle: null, measuredAt: 0, bytes: 0 };

export function setQuotaDirectoryProvider(provider) {
  directoryHandleProvider = provider;
  invalidateDirectoryUsageCache();
}

export function invalidateDirectoryUsageCache() {
  directoryUsageCache = { handle: null, measuredAt: 0, bytes: 0 };
}

async function getDirectoryBytes(handle) {
  if (!handle || typeof handle.values !== 'function') return 0;
  const now = Date.now();
  if (directoryUsageCache.handle === handle && now - directoryUsageCache.measuredAt < 5000) {
    return directoryUsageCache.bytes;
  }

  let bytes = 0;
  const visit = async (directory) => {
    for await (const entry of directory.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        bytes += file.size;
      } else if (entry.kind === 'directory') {
        await visit(entry);
      }
    }
  };
  await visit(handle);
  directoryUsageCache = { handle, measuredAt: now, bytes };
  return bytes;
}

export async function getUsed() {
  let originBytes = 0;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    originBytes = Number.isFinite(estimate.usage) ? estimate.usage : 0;
  }
  const directoryHandle = await directoryHandleProvider();
  const directoryBytes = await getDirectoryBytes(directoryHandle);
  return originBytes + directoryBytes;
}

export async function canWrite(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new TypeError('Storage write size must be a non-negative number of bytes.');
  }
  const used = await getUsed();
  return used + bytes < MAX_QUOTA_BYTES;
}

export async function checkLimit() {
  const used = await getUsed();
  const gb = (used / (1024 ** 3)).toFixed(2);
  const percentage = Math.min(100, Math.round((used / MAX_QUOTA_BYTES) * 100));
  const text = `${gb} GB used of 20 GB allocated · ${percentage}%`;
  const element = typeof document === 'undefined' ? null : document.getElementById('quota-bar');
  if (element) {
    element.textContent = text;
    element.setAttribute('aria-label', '20 GB Allocated - For Complete AGUS System (Not only AI)');
    element.setAttribute('aria-valuenow', String(percentage));
    element.setAttribute('aria-valuemax', '100');
  }
  return { used, max: MAX_QUOTA_BYTES, percentage, text };
}
