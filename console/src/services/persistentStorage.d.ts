export type KrynaraChatMessage = {
  role: 'user' | 'nova';
  text: string;
  at?: string;
  id?: string;
};

export function initKrynaraStorage(): Promise<{
  persistentStorageGranted: boolean;
  directoryName: string;
  directorySelected: boolean;
  directoryStatus: string;
  warnings: string[];
}>;
export function selectKrynaraDataDirectory(): Promise<{
  persistentStorageGranted: boolean;
  directoryName: string;
  directorySelected: boolean;
  directoryStatus: string;
  warnings: string[];
}>;
export function getKrynaraStorageStatus(warnings?: string[]): {
  persistentStorageGranted: boolean;
  directoryName: string;
  directorySelected: boolean;
  directoryStatus: string;
  warnings: string[];
};
export function getKrynaraItem<T>(storeName: 'chats' | 'logs' | 'memory', key: IDBValidKey, fallback: T): Promise<T>;
export function setKrynaraItem(storeName: 'chats' | 'logs' | 'memory', key: IDBValidKey, value: unknown): Promise<{ warning: string }>;
export function appendChatCompletion(
  chatId: string,
  messages: KrynaraChatMessage[],
  logEntry: Record<string, unknown>,
  memorySaver?: boolean,
): Promise<{ recent: KrynaraChatMessage[]; archivedCount: number; warning: string }>;
export function loadChatHistory(chatId: string): Promise<{ messages: KrynaraChatMessage[]; archivedCount: number }>;
export function expandChatHistory(chatId: string): Promise<KrynaraChatMessage[]>;
export function compactChatHistory(chatId: string): Promise<{ recent: KrynaraChatMessage[]; archivedCount: number }>;
export function exportAllKrynaraMemory(): Promise<Record<string, Record<string, unknown>>>;
export function importKrynaraMemory(data: unknown): Promise<void>;
export function testKrynaraPersistence(): Promise<{ test: boolean; at: string }>;
