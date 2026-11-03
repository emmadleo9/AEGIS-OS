export type ModelProvider = 'nvidia' | 'groq' | 'openrouter' | 'tavily';

const STORAGE_KEYS: Record<ModelProvider, string> = {
  nvidia: 'aegis_nvidia_key',
  groq: 'aegis_groq_key',
  openrouter: 'aegis_openrouter_key',
  tavily: 'aegis_tavily_key',
};

export function getKey(provider: ModelProvider): string | null {
  try {
    const stored = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEYS[provider]);
    if (stored?.trim()) return stored.trim();
  } catch {
    return null;
  }
  return null;
}

export function setKey(provider: ModelProvider, key: string): void {
  if (typeof window === 'undefined') throw new Error('API keys can only be saved in a browser.');
  const value = key.trim();
  if (!value) throw new Error('Enter an API key before saving.');
  window.localStorage.setItem(STORAGE_KEYS[provider], value);
}
