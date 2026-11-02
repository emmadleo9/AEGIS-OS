/** Plane service — gateway ADS-B (OpenSky/adsb.lol) with offline cached fallback. */
import { safeFetch } from './offlineFetch';

export type Plane = { icao24: string; callsign: string; lat: number; lon: number; alt: number; heading: number; speed: number };
const MOCK: Plane[] = [];

export async function getPlanes(): Promise<{ planes: Plane[]; offline: boolean }> {
  const result = await safeFetch<{ ac?: Array<Record<string, unknown>> }>('/api/feeds/adsb', { ac: [] }, {}, 15_000);
  const planes = (result.data.ac ?? []).slice(0, 400).map((aircraft) => ({
    icao24: String(aircraft.hex ?? ''),
    callsign: String(aircraft.flight ?? '').trim(),
    lat: Number(aircraft.lat),
    lon: Number(aircraft.lon),
    alt: Number(aircraft.alt_baro ?? 0),
    heading: Number(aircraft.track ?? 0),
    speed: Number(aircraft.gs ?? 0),
  })).filter((plane) => Number.isFinite(plane.lat) && Number.isFinite(plane.lon));
  return { planes, offline: result.offline };
}
