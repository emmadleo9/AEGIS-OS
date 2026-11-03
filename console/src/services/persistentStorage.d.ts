export type AegisChatMessage = {
  role: 'user' | 'nova';
  text: string;
  at?: string;
  id?: string;
};

export function initAegisStorage(): Promise<{
  persistentStorageGranted: boolean;
  directoryName: string;
  directorySelected: boolean;
  directoryStatus: string;
  warnings: string[];
}>;
export function selectAegisDataDirectory(): Promise<{
  persistentStorageGranted: boolean;
  directoryName: string;
  directorySelected: boolean;
  directoryStatus: string;
  warnings: string[];
}>;
export function getAegisStorageStatus(warnings?: string[]): {
  persistentStorageGranted: boolean;
  directoryName: string;
  directorySelected: boolean;
  directoryStatus: string;
  warnings: string[];
};
export function getAegisItem<T>(storeName: 'chats' | 'logs' | 'memory', key: IDBValidKey, fallback: T): Promise<T>;
export function setAegisItem(storeName: 'chats' | 'logs' | 'memory', key: IDBValidKey, value: unknown): Promise<{ warning: string }>;
export function appendChatCompletion(
  chatId: string,
  messages: AegisChatMessage[],
  logEntry: Record<string, unknown>,
  memorySaver?: boolean,
): Promise<{ recent: AegisChatMessage[]; archivedCount: number; warning: string }>;
export function loadChatHistory(chatId: string): Promise<{ messages: AegisChatMessage[]; archivedCount: number }>;
export function expandChatHistory(chatId: string): Promise<AegisChatMessage[]>;
export function compactChatHistory(chatId: string): Promise<{ recent: AegisChatMessage[]; archivedCount: number }>;
export function exportAllAegisMemory(): Promise<Record<string, Record<string, unknown>>>;
export function importAegisMemory(data: unknown): Promise<void>;
export function testAegisPersistence(): Promise<{ test: boolean; at: string }>;
