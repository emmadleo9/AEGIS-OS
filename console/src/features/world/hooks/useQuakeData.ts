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

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      try {
        const res = await fetch('/api/world/quakes').catch(() => fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'));
        const data = await res.json();
        const features = data.features || [];
        const parsed: Quake[] = features.map((f: any) => ({
          id: f.id,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          magnitude: f.properties.mag ?? 0,
          place: f.properties.place ?? '',
          time: f.properties.time ?? 0,
        }));
        if (active) setQuakes(parsed);
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

  return { quakes, loading };
}
