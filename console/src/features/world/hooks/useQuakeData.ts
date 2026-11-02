import { useEffect, useState } from 'react';

export interface Quake {
  id: string;
  lat: number;
  lon: number;
  magnitude: number;
  place: string;
  time: number;
}

export function useQuakeData(intervalMs = 60000) {
  const [quakes, setQuakes] = useState<Quake[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/feeds/usgs', { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`USGS returned HTTP ${response.status}`);
        const data = await response.json() as { features?: Array<{ id: string; geometry: { coordinates: number[] }; properties: { mag: number | null; place: string; time: number } }> };
        const parsed = (data.features ?? []).map((feature) => ({
          id: feature.id,
          lon: feature.geometry.coordinates[0] ?? 0,
          lat: feature.geometry.coordinates[1] ?? 0,
          magnitude: feature.properties.mag ?? 0,
          place: feature.properties.place ?? 'Unknown',
          time: feature.properties.time ?? 0,
        }));
        if (active) { setQuakes(parsed); setError(''); }
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
  return { quakes, loading, error };
}
