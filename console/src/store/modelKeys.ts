export type ModelProvider = 'nvidia' | 'groq' | 'openrouter' | 'tavily';

const STORAGE_KEYS: Record<ModelProvider, string> = {
  nvidia: 'krynara_nvidia_key',
  groq: 'krynara_groq_key',
  openrouter: 'krynara_openrouter_key',
  tavily: 'krynara_tavily_key',
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
