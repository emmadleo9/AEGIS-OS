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

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      try {
        const res = await fetch('/api/world/flights').catch(() => fetch('https://api.adsb.lol/v2/all'));
        const data = await res.json();
        const ac = data.ac || data.states || [];
        const parsed: Flight[] = ac.slice(0, 300).map((a: any) => ({
          icao24: a.hex || a[0] || '',
          lat: a.lat ?? a[6],
          lon: a.lon ?? a[5],
          alt: a.alt_baro ?? a[7] ?? 0,
          heading: a.track ?? a[10] ?? 0,
          speed: a.gs ?? a[9] ?? 0,
          callsign: a.flight?.trim() || a.callsign || a[1] || '',
        })).filter((f: Flight) => f.lat && f.lon);
        if (active) setFlights(parsed);
      } catch {
        // ignore
      } finally {
        if (active) setLoading(false);
      }
    };
    fetch();
    const id = setInterval(fetch, intervalMs);
    return () => { active = false; clearInterval(id); };
  }, [intervalMs]);

  return { flights, loading };
}
