/**
 * AEGIS key store — user's OWN API accounts (never fake keys).
 * Persisted to D:/AEGIS-OS-STORAGE/config/keys.json; never committed to git.
 */
const fs = require('node:fs');
const path = require('node:path');

const KEY_DIR = 'D:/AEGIS-OS-STORAGE/config';
const KEY_FILE = path.join(KEY_DIR, 'keys.json');

const KEY_REGISTRY = [
  { id: 'NV_API_KEY', envKeys: ['NV_API_KEY', 'NVIDIA_NIM_API_KEY', 'VITE_NVIDIA_NIM_API_KEY'], label: 'NVIDIA NIM (build.nvidia.com)', url: 'https://build.nvidia.com', scope: 'chat, image, video, audio, vision' },
  { id: 'VITE_CESIUM_ION_TOKEN', envKeys: ['VITE_CESIUM_ION_TOKEN', 'CESIUM_ION_TOKEN'], label: 'Cesium ion (cesium.com)', url: 'https://cesium.com/ion/tokens', scope: '3D terrain, satellite, buildings' },
  { id: 'VITE_OPENWEATHER_API_KEY', envKeys: ['VITE_OPENWEATHER_API_KEY', 'OPENWEATHER_API_KEY'], label: 'OpenWeatherMap', url: 'https://home.openweathermap.org/api_keys', scope: 'thermal, wind, precipitation layers' },
  { id: 'VITE_MAPBOX_TOKEN', envKeys: ['VITE_MAPBOX_TOKEN', 'MAPBOX_TOKEN'], label: 'Mapbox', url: 'https://account.mapbox.com/access-tokens/', scope: 'satellite basemap fallback' },
  { id: 'VITE_ELEVENLABS_API_KEY', envKeys: ['VITE_ELEVENLABS_API_KEY', 'ELEVENLABS_API_KEY'], label: 'ElevenLabs', url: 'https://elevenlabs.io/app/settings/api-keys', scope: 'British TTS audio' },
  { id: 'VITE_OPENSKY_USER', envKeys: ['VITE_OPENSKY_USER', 'OPENSKY_USER'], label: 'OpenSky Network', url: 'https://opensky-network.org/', scope: 'live plane telemetry' },
];

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(store) {
  fs.mkdirSync(KEY_DIR, { recursive: true });
  fs.writeFileSync(KEY_FILE, JSON.stringify(store, null, 2));
}

function mask(value) {
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

module.exports = {
  register(app) {
    app.get('/api/keys', (_req, res) => {
      const store = readStore();
      res.json({
        keys: KEY_REGISTRY.map(({ id, label, url, scope }) => ({
          id, label, url, scope,
          connected: Boolean(store[id]),
          masked: mask(store[id]),
        })),
        file: KEY_FILE,
      });
    });

    app.post('/api/keys/:id', (req, res) => {
      const entry = KEY_REGISTRY.find((item) => item.id === req.params.id);
      if (!entry) return res.status(404).json({ error: 'Unknown key id.' });
      const value = String(req.body?.value ?? '').trim();
      if (!value) return res.status(400).json({ error: 'value required.' });
      const store = readStore();
      store[entry.id] = value;
      writeStore(store);
      res.json({ saved: entry.id, masked: mask(value) });
    });

    app.delete('/api/keys/:id', (req, res) => {
      const store = readStore();
      delete store[req.params.id];
      writeStore(store);
      res.json({ removed: req.params.id });
    });

    // Internal resolver for other gateway routes
    app.locals.getApiKey = (id) => readStore()[id] ?? process.env[id] ?? '';
  },
  KEY_REGISTRY,
  getApiKey: (id) => readStore()[id] ?? process.env[id] ?? '',
};
