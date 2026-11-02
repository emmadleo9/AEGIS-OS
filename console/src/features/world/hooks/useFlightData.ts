import { useEffect, useState } from 'react';

export interface Flight {
  icao24: string;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  speed: number;
  callsign: string;
}

export function useFlightData(intervalMs = 15000) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/feeds/adsb', { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`ADS-B returned HTTP ${response.status}`);
        const data = await response.json() as { ac?: Array<Record<string, unknown>> };
        const parsed = (data.ac ?? []).slice(0, 400).map((aircraft) => ({
          icao24: typeof aircraft.hex === 'string' || typeof aircraft.hex === 'number' ? String(aircraft.hex) : '',
          lat: Number(aircraft.lat),
          lon: Number(aircraft.lon),
          alt: Number(aircraft.alt_baro ?? 0),
          heading: Number(aircraft.track ?? 0),
          speed: Number(aircraft.gs ?? 0),
          callsign: typeof aircraft.flight === 'string' || typeof aircraft.flight === 'number' ? String(aircraft.flight).trim() : '',
        })).filter((flight) => Number.isFinite(flight.lat) && Number.isFinite(flight.lon) && Math.abs(flight.lat) <= 90 && Math.abs(flight.lon) <= 180);
        if (active) { setFlights(parsed); setError(''); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), intervalMs);
    return () => { active = false; window.clearInterval(id); };
  }, [intervalMs]);
  return { flights, loading, error };
}
