export const MAX_QUOTA_BYTES: number;
export function setQuotaDirectoryProvider(provider: () => Promise<unknown>): void;
export function invalidateDirectoryUsageCache(): void;
export function getUsed(): Promise<number>;
export function canWrite(bytes: number): Promise<boolean>;
export function checkLimit(): Promise<{ used: number; max: number; percentage: number; text: string }>;
