import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import * as maplibregl from 'maplibre-gl';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GaugeCircle, HudFrame } from '@/components/hud';

type WeatherPlace = { name: string; country: string; latitude: number; longitude: number };
type PlaceSuggestion = WeatherPlace & { admin1?: string };
type WeatherData = {
  current?: { temperature_2m: number; wind_speed_10m: number; relative_humidity_2m: number; surface_pressure: number };
  hourly?: { time: string[]; temperature_2m: number[] };
  daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
};
const defaultPlace: WeatherPlace = { name: 'Islamabad', country: 'Pakistan', latitude: 33.68, longitude: 73.04 };

// OpenWeatherMap LIVE overlay layers — proxied via gateway so YOUR key stays server-side
const OWM_LAYERS = {
  temp_new: 'TEMP',
  wind_new: 'WIND',
  precipitation_new: 'PRECIP',
  clouds_new: 'CLOUDS',
  pressure_new: 'PRESSURE',
} as const;
const pakistanCities = [
  { name: 'Islamabad', latitude: 33.68, longitude: 73.04 },
  { name: 'Rawalpindi', latitude: 33.56, longitude: 73.07 },
  { name: 'Lahore', latitude: 31.55, longitude: 74.34 },
  { name: 'Karachi', latitude: 24.86, longitude: 67.01 },
  { name: 'Peshawar', latitude: 34.01, longitude: 71.58 },
  { name: 'Quetta', latitude: 30.18, longitude: 66.98 },
];

function WeatherMiniMap({ place }: { place: WeatherPlace }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [layer, setLayer] = useState<keyof typeof OWM_LAYERS | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    setMapUnavailable(false);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [place.longitude, place.latitude],
      zoom: 4,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    const loadTimeout = window.setTimeout(() => setMapUnavailable(true), 8000);
    map.once('load', () => {
      window.clearTimeout(loadTimeout);
      new maplibregl.Marker({ color: '#8AF8FF' }).setLngLat([place.longitude, place.latitude]).addTo(map);
      if (layer) {
          void fetch(`/api/weather-tiles/${layer}`).then((response) => response.json()).then((data: { tileUrl?: string }) => {
            if (!data.tileUrl) return;
            map.addSource('owm-layer', { type: 'raster', tiles: [data.tileUrl], tileSize: 256 });
            map.addLayer({ id: 'owm-layer-view', type: 'raster', source: 'owm-layer', paint: { 'raster-opacity': .65 } });
          }).catch(() => undefined);
      }
      map.resize();
    });
    map.once('error', () => setMapUnavailable(true));
    return () => { window.clearTimeout(loadTimeout); map.remove(); mapRef.current = null; };
  }, [place.latitude, place.longitude, layer]);

  const delta = 0.12;
  const bounds = `${place.longitude - delta},${place.latitude - delta},${place.longitude + delta},${place.latitude + delta}`;
  return (
    <div className="weather-map-container" aria-label={`Map of ${place.name}`}>
      <div ref={containerRef} className="weather-mini-map" />
      <div className="weather-layer-picker">
        <button type="button" className={layer === null ? 'device-tab active' : 'device-tab'} onClick={() => setLayer(null)}>BASE</button>
        {Object.entries(OWM_LAYERS).map(([id, label]) => (
          <button type="button" key={id} className={layer === id ? 'device-tab active' : 'device-tab'} onClick={() => setLayer(id as keyof typeof OWM_LAYERS)}>{label}</button>
        ))}
      </div>
      {mapUnavailable && <iframe className="weather-map-fallback" title={`OpenStreetMap view of ${place.name}`} src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bounds)}&layer=mapnik&marker=${place.latitude}%2C${place.longitude}`} />}
    </div>
  );
}

export function WeatherView() {
  const [place, setPlace] = useState(defaultPlace);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const params = new URLSearchParams({
          latitude: String(place.latitude),
          longitude: String(place.longitude),
        });
        const response = await fetch(`/api/weather?${params}`, { signal: AbortSignal.timeout(12000), cache: 'no-store' });
        if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}`);
        const result = await response.json() as WeatherData;
        if (active) { setWeather(result); setError(''); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (active) setLoading(false);
      }
    };
    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [place]);

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetch(`/api/geocode?q=${encodeURIComponent(search)}`, { signal: controller.signal, cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error(`City search returned HTTP ${response.status}`);
          return await response.json() as { results?: PlaceSuggestion[] };
        })
        .then((result) => setSuggestions(result.results ?? []))
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setSuggestions([]);
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const hourly = useMemo(() => (weather?.hourly?.time ?? []).slice(0, 24).map((time, index) => ({
    time: new Intl.DateTimeFormat(undefined, { hour: '2-digit' }).format(new Date(time)),
    temperature: weather?.hourly?.temperature_2m[index] ?? null,
  })), [weather]);

  const searchCity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const city = query.trim();
    if (!city) return;
    setError('');
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(city)}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`City search returned HTTP ${response.status}`);
      const result = await response.json() as { results?: PlaceSuggestion[] };
      const match = result.results?.[0];
      if (!match) throw new Error(`No location found for "${city}".`);
      setPlace({ name: match.name, country: match.country ?? '—', latitude: match.latitude, longitude: match.longitude });
      setQuery('');
      setSuggestions([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const selectSuggestion = (match: PlaceSuggestion) => {
    setPlace({ name: match.name, country: match.country ?? '—', latitude: match.latitude, longitude: match.longitude });
    setQuery('');
    setSuggestions([]);
    setError('');
  };

  const current = weather?.current;
  const daily = weather?.daily;
  const temperature = current?.temperature_2m;

  const cityTemps = useMemo(() => pakistanCities, []);

  return (
    <div className="weather-layout">
      <HudFrame title="CURRENT CONDITIONS" className="weather-current">
        <div className="weather-place">{place.name.toUpperCase()} <span>{place.country.toUpperCase()}</span></div>
        <div className="weather-gauge-wrap">
          <GaugeCircle label="AIR TEMPERATURE" value={temperature === undefined ? '--' : `${Math.round(temperature)}°`} sub="CELSIUS" percent={Math.max(0, Math.min(100, ((temperature ?? 0) + 10) * 2))} size={180} />
        </div>
        <div className="weather-detail-list">
          <div><span>WIND</span><strong>{current ? `${Math.round(current.wind_speed_10m)} km/h` : '—'}</strong></div>
          <div><span>HUMIDITY</span><strong>{current ? `${current.relative_humidity_2m}%` : '—'}</strong></div>
          <div><span>PRESSURE</span><strong>{current ? `${Math.round(current.surface_pressure)} hPa` : '—'}</strong></div>
          <div><span>UPDATED</span><strong>{loading ? 'SYNCING' : current ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'OFFLINE'}</strong></div>
        </div>
        <p className={error ? 'weather-error' : 'weather-source'} role={error ? 'alert' : undefined}>
          {error || (loading ? 'LOADING LIVE CONDITIONS…' : 'SOURCE: OPEN-METEO · 60S REFRESH')}
        </p>
      </HudFrame>

      <div className="weather-center">
        <HudFrame title="THREE-DAY OUTLOOK" className="weather-forecast">
          <div className="forecast-days">
            {(daily?.time ?? []).map((date, index) => (
              <div className="forecast-day" key={date}>
                <span>{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`))}</span>
                <strong>{daily?.temperature_2m_max[index] ?? '—'}°</strong>
                <span>LOW {daily?.temperature_2m_min[index] ?? '—'}°</span>
              </div>
            ))}
            {!daily?.time.length && <div className="forecast-day">Forecast unavailable</div>}
          </div>
        </HudFrame>
        <HudFrame title="HOURLY TEMPERATURE // 24H" className="weather-hourly">
          {hourly.length ? (
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 400, height: 260 }}>
              <LineChart data={hourly} margin={{ top: 12, right: 12, bottom: 4, left: -18 }}>
                <CartesianGrid stroke="rgba(138,248,255,.12)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: '#9ab8bd', fontSize: 10 }} interval={3} axisLine={{ stroke: 'rgba(138,248,255,.2)' }} tickLine={false} />
                <YAxis tick={{ fill: '#9ab8bd', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#07151b', border: '1px solid #8AF8FF', color: '#E6FBFF' }} />
                <Line type="monotone" dataKey="temperature" name="°C" stroke="#8AF8FF" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#8AF8FF' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="weather-chart-empty">{loading ? 'LOADING HOURLY FORECAST…' : 'HOURLY DATA UNAVAILABLE'}</div>}
        </HudFrame>
      </div>

      <div className="weather-location">
        <HudFrame title="LOCATION // SEARCH" className="weather-search-panel">
          <form onSubmit={(event) => void searchCity(event)} className="weather-search-form">
            <label htmlFor="weather-city-search">CITY OR PLACE</label>
            <div><input id="weather-city-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a city…" autoComplete="off" /><button className="hud-button" type="submit">GO</button></div>
            {(searching || suggestions.length > 0) && (
              <div className="weather-suggestions" role="listbox" aria-label="City suggestions">
                {searching && <div className="weather-suggestion-status">SEARCHING LOCATIONS…</div>}
                {suggestions.map((suggestion) => (
                  <button type="button" role="option" aria-selected="false" className="weather-suggestion" key={`${suggestion.latitude}-${suggestion.longitude}`} onClick={() => selectSuggestion(suggestion)}>
                    <strong>{suggestion.name}{suggestion.admin1 ? `, ${suggestion.admin1}` : ''}</strong>
                    <span>{suggestion.country ?? '—'} · {suggestion.latitude.toFixed(2)}, {suggestion.longitude.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
          </form>
          <div className="weather-coordinate">{Math.abs(place.latitude).toFixed(3)}°{place.latitude < 0 ? 'S' : 'N'} / {Math.abs(place.longitude).toFixed(3)}°{place.longitude < 0 ? 'W' : 'E'} · LIVE</div>
          <WeatherMiniMap place={place} />
          <div className="weather-map-caption"><span className="status-dot" /> ACTIVE FORECAST LOCATION</div>
          <div className="weather-city-grid">
            {cityTemps.map((city) => (
              <button type="button" key={city.name} className="wa-chat-item" onClick={() => setPlace({ name: city.name, country: 'Pakistan', latitude: city.latitude, longitude: city.longitude })}>
                <span className="wa-chat-name">{city.name.toUpperCase()}</span>
                <span className="wa-chat-preview">PK</span>
              </button>
            ))}
          </div>
        </HudFrame>
      </div>
    </div>
  );
}
