// AEGIS API client — points to gateway and brain instead of Supabase

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || "http://localhost:2785";
const BRAIN_URL = import.meta.env.VITE_BRAIN_URL || "http://localhost:8000";

export { GATEWAY_URL, BRAIN_URL };

export async function gatewayFetch(
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
  const apiKey = import.meta.env.VITE_API_MASTER_KEY || "aegis_master_key";
  return fetch(`${GATEWAY_URL}/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...opts.headers,
    },
  });
}

export async function brainFetch(
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
  return fetch(`${BRAIN_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });
}

export type Status = { connected: boolean; service: string };
export type MessageTypes = "text" | "image" | "audio" | "document";
export type Draft = { text: string; timestamp: string };
