const ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';
const cache = new Map();
const CACHE_MS = 60_000;

function parsePoint(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split(',');
  if (parts.length !== 2 || parts.some((part) => part.trim() === '')) return null;
  const coordinates = parts.map(Number);
  if (coordinates.length !== 2 || !coordinates.every(Number.isFinite)) return null;
  const [longitude, latitude] = coordinates;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return [longitude, latitude];
}

function register(app) {
  app.get('/api/feeds/directions', async (req, res) => {
    const from = parsePoint(req.query.from);
    const to = parsePoint(req.query.to);
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to must be longitude,latitude coordinates.' });
    }

    const key = `${from.join(',')};${to.join(',')}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.time < CACHE_MS) {
      res.setHeader('Cache-Control', 'public, max-age=30');
      return res.json(cached.data);
    }

    try {
      const url = `${ROUTE_URL}/${key}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Krynara-OS World View' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`OSRM returned HTTP ${response.status}`);
      const result = await response.json();
      const route = result.routes?.[0];
      const coordinates = route?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2
        || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)
        || coordinates.some((point) => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) {
        throw new Error(result.message || 'OSRM did not return a valid route.');
      }

      const data = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {
          distance: route.distance,
          duration: route.duration,
          steps: (route.legs ?? []).flatMap((leg) => leg.steps ?? []).map((step) => ({
            name: step.name ?? '',
            distance: step.distance,
            duration: step.duration,
            maneuver: step.maneuver?.type ?? '',
          })),
          source: 'OpenStreetMap · OSRM',
        },
      };
      cache.set(key, { time: Date.now(), data });
      for (const [cacheKey, entry] of cache) {
        if (Date.now() - entry.time >= CACHE_MS) cache.delete(cacheKey);
      }
      res.setHeader('Cache-Control', 'public, max-age=30');
      return res.json(data);
    } catch (error) {
      return res.status(502).json({
        error: error instanceof Error ? error.message : 'Route planning is unavailable.',
      });
    }
  });
}

module.exports = { register };
