const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 64;
const cache = new Map();
const inflight = new Map();

function parseBounds(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split(',');
  if (parts.length !== 4 || parts.some((part) => part.trim() === '')) return null;
  const bounds = parts.map(Number);
  if (!bounds.every(Number.isFinite)
    || bounds[0] < -180 || bounds[2] > 180 || bounds[1] < -90 || bounds[3] > 90
    || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) return null;
  return bounds;
}

function sampleLocations(bounds) {
  const [west, south, east, north] = bounds;
  const width = east - west;
  const height = north - south;
  const columns = Math.max(2, Math.min(8, Math.ceil(width / Math.max(0.5, width / 6))));
  const rows = Math.max(2, Math.min(6, Math.ceil(height / Math.max(0.5, height / 4))));
  const points = [];
  for (let row = 0; row < rows; row += 1) {
    const latitude = south + height * (row + 0.5) / rows;
    if (latitude < -80 || latitude > 80) continue;
    for (let column = 0; column < columns; column += 1) {
      points.push({
        latitude: Math.round(latitude * 100) / 100,
        longitude: Math.round((west + width * (column + 0.5) / columns) * 100) / 100,
      });
    }
  }
  return points;
}

async function loadWind(bounds) {
  const points = sampleLocations(bounds);
  if (points.length === 0) return { type: 'FeatureCollection', features: [], source: 'Open-Meteo' };
  const params = new URLSearchParams({
    latitude: points.map((point) => point.latitude).join(','),
    longitude: points.map((point) => point.longitude).join(','),
    current: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
  });
  const response = await fetch(`${OPEN_METEO_URL}?${params}`, {
    signal: AbortSignal.timeout(15_000),
    headers: { 'User-Agent': 'AEGIS-OS World View' },
  });
  if (!response.ok) throw new Error(`Open-Meteo wind returned HTTP ${response.status}`);
  const result = await response.json();
  const locations = Array.isArray(result) ? result : [result];
  const features = locations.flatMap((location) => {
    const speed = location.current?.wind_speed_10m;
    const direction = location.current?.wind_direction_10m;
    if (!Number.isFinite(location.longitude) || !Number.isFinite(location.latitude)
      || !Number.isFinite(speed) || !Number.isFinite(direction)) return [];
    return [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [location.longitude, location.latitude] },
      properties: {
        speed: Math.round(speed * 10) / 10,
        direction,
        bearing: (direction + 180) % 360,
        source: 'Open-Meteo · 10 m wind',
        time: location.current.time,
      },
    }];
  });
  return { type: 'FeatureCollection', features, source: 'Open-Meteo', updatedAt: new Date().toISOString() };
}

function register(app) {
  app.get('/api/feeds/wind', async (req, res) => {
    const bounds = parseBounds(req.query.bbox);
    if (!bounds) return res.status(400).json({ error: 'bbox must be west,south,east,north in geographic degrees.' });
    const key = bounds.map((value) => value.toFixed(1)).join(',');
    const cached = cache.get(key);
    if (cached && Date.now() - cached.time < CACHE_MS) {
      res.setHeader('Cache-Control', 'public, max-age=120');
      return res.json(cached.data);
    }
    try {
      let request = inflight.get(key);
      if (!request) {
        request = loadWind(bounds).then((data) => {
          cache.set(key, { time: Date.now(), data });
          if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
          return data;
        }).finally(() => inflight.delete(key));
        inflight.set(key, request);
      }
      const data = await request;
      res.setHeader('Cache-Control', 'public, max-age=120');
      return res.json(data);
    } catch (error) {
      return res.status(502).json({ error: error instanceof Error ? error.message : 'Wind data is unavailable.' });
    }
  });
}

module.exports = { register, parseBounds, sampleLocations };
