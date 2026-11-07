type StudioError = { error?: string; code?: string };

export class StudioRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'StudioRequestError';
    this.status = status;
    this.code = code;
  }
}

export async function studioRequest<T>(path: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(path, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('The local KRYNARA gateway request timed out. Check that the gateway is running at localhost:2785.');
      }
      if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
        throw new Error('Cannot reach the KRYNARA gateway. Start or restart the local gateway at localhost:2785, then try again.');
      }
      throw error;
    }

    const body = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      const detail = body.trimStart().startsWith('<')
        ? 'The gateway returned an HTML page instead of its API response. Restart the KRYNARA gateway and retry.'
        : 'The gateway returned an invalid response body.';
      throw new Error(`${detail} (HTTP ${response.status}).`);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(`The gateway returned an unexpected response shape (HTTP ${response.status}).`);
    }
    const result = data as T & StudioError;
    if (!response.ok || result.error) {
      throw new StudioRequestError(
        result.error ?? `AI Studio request failed (HTTP ${response.status}).`,
        response.status,
        result.code,
      );
    }
    return result;
  } finally {
    window.clearTimeout(timeout);
  }
}
