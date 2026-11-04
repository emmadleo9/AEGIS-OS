import { useEffect, useRef, useState, type FormEvent } from 'react';
import { HudFrame } from '@/components/hud';
import { GlobeMap, type WeatherAlertCollection, type WorldMapHandle } from './components/GlobeMap';
import { useFlightData } from './hooks/useFlightData';
import { useQuakeData } from './hooks/useQuakeData';

type MapMode = '2d' | '3d' | 'satellite';
type LayerKey = 'flights' | 'satellites' | 'earthquakes' | 'weather' | 'weatherAlerts' | 'rainRadar' | 'satelliteClouds' | 'waterVapor' | 'wind' | 'transit' | 'conflict' | 'marine' | 'fires' | 'dayNight' | 'buildings3d' | 'terrain';
type LayerVisibility = Record<LayerKey, boolean>;
type Counts = { aircraft: number; quakes: number; satellites: number; alerts: number; fires: number; incidents: number; transit: number };
type PlaceResult = { name: string; latitude: number; longitude: number; admin1?: string; country?: string; country_code?: string };
type RainFrame = { tileUrl: string; time: number };
type DrawMode = 'point' | 'line' | 'polygon' | null;
type DrawFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, string | number>>;
type RouteProperties = { distance: number; duration: number; steps: { name: string; distance: number; duration: number; maneuver: string }[]; source: string };
type RouteFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, string | number>>;

const LAYER_STORAGE_KEY = 'aegis.world.layers.v1';
const DRAWING_STORAGE_KEY = 'aegis.world.drawings.v1';
const INITIAL_LAYERS: LayerVisibility = {
  flights: true,
  satellites: true,
  earthquakes: true,
  weather: false,
  weatherAlerts: false,
  rainRadar: false,
  satelliteClouds: false,
  waterVapor: false,
  wind: false,
  transit: false,
  conflict: true,
  marine: true,
  fires: true,
  dayNight: true,
  buildings3d: false,
  terrain: false,
};

const LAYER_GROUPS: { label: string; items: { key: LayerKey; label: string; source: string }[] }[] = [
  { label: 'AVIATION', items: [{ key: 'flights', label: 'Live aircraft', source: 'ADS-B · adsb.lol' }] },
  { label: 'SPACE', items: [{ key: 'satellites', label: 'Tracked satellites', source: 'Where the ISS at' }] },
  { label: 'HAZARDS', items: [
    { key: 'earthquakes', label: 'Earthquakes', source: 'USGS · past 24 hours' },
    { key: 'fires', label: 'Active fires', source: 'NASA EONET' },
    { key: 'weatherAlerts', label: 'Severe weather alerts', source: 'NOAA National Weather Service' },
    { key: 'rainRadar', label: 'Precipitation radar', source: 'RainViewer · radar imagery' },
    { key: 'satelliteClouds', label: 'Infrared cloud imagery', source: 'NOAA/NESDIS · geostationary satellite mosaic' },
    { key: 'waterVapor', label: 'Water vapor imagery', source: 'NOAA/NESDIS · geostationary satellite mosaic' },
    { key: 'wind', label: 'Surface wind vectors', source: 'Open-Meteo · live 10 m wind grid' },
    { key: 'weather', label: 'Weather stations', source: 'Open-Meteo · major cities' },
  ] },
  { label: 'INTELLIGENCE', items: [{ key: 'conflict', label: 'Global incidents', source: 'GDELT 2.0' }] },
  { label: 'MARITIME', items: [{ key: 'marine', label: 'Shipping corridors', source: 'Reference routes' }] },
  { label: 'TRANSIT', items: [{ key: 'transit', label: 'Live buses & transit', source: 'Public GTFS-Realtime · selected keyless operator feeds' }] },
  { label: 'DISPLAY', items: [
    { key: 'dayNight', label: 'Day / night cycle', source: 'Solar position · updated each minute' },
    { key: 'buildings3d', label: '3D buildings', source: 'Basemap building tiles · zoom 14.5+' },
    { key: 'terrain', label: 'Terrain relief', source: 'AWS Terrain Tiles · Terrarium' },
  ] },
];

const PRESETS = [
  { label: 'GLOBAL', lat: 20, lon: 0, zoom: 2.8 },
  { label: 'EUROPE', lat: 50, lon: 15, zoom: 4 },
  { label: 'MIDDLE EAST', lat: 27, lon: 45, zoom: 4 },
  { label: 'EAST ASIA', lat: 35, lon: 115, zoom: 4 },
  { label: 'NORTH AMERICA', lat: 40, lon: -100, zoom: 3 },
  { label: 'SOUTH AMERICA', lat: -15, lon: -60, zoom: 3 },
];

function readSavedLayers(): LayerVisibility {
  try {
    const saved = localStorage.getItem(LAYER_STORAGE_KEY);
    if (!saved) return INITIAL_LAYERS;
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return INITIAL_LAYERS;
    return Object.fromEntries(
      Object.keys(INITIAL_LAYERS).map((key) => [
        key,
        typeof (parsed as Record<string, unknown>)[key] === 'boolean'
          ? (parsed as Record<string, boolean>)[key]
          : INITIAL_LAYERS[key as LayerKey],
      ]),
    ) as LayerVisibility;
  } catch {
    return INITIAL_LAYERS;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPosition(value: unknown): value is GeoJSON.Position {
  return Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite);
}

function isDrawingGeometry(value: unknown): value is GeoJSON.Geometry {
  if (!isRecord(value)) return false;
  if (value.type === 'Point') return isPosition(value.coordinates);
  if (value.type === 'LineString') {
    return Array.isArray(value.coordinates) && value.coordinates.length >= 2 && value.coordinates.every(isPosition);
  }
  if (value.type === 'Polygon') {
    return Array.isArray(value.coordinates) && value.coordinates.length > 0
      && value.coordinates.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition));
  }
  return false;
}

function readSavedDrawings(): DrawFeatureCollection {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(DRAWING_STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object' || !('features' in saved) || !Array.isArray(saved.features)) {
      return { type: 'FeatureCollection', features: [] };
    }
    const features: DrawFeatureCollection['features'] = [];
    for (const candidate of saved.features as unknown[]) {
      if (!isRecord(candidate) || candidate.type !== 'Feature' || !isDrawingGeometry(candidate.geometry)
        || !isRecord(candidate.properties)) continue;
      const properties: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(candidate.properties)) {
        if (typeof value === 'string' || typeof value === 'number') properties[key] = value;
      }
      features.push({ type: 'Feature', geometry: candidate.geometry, properties });
    }
    return { type: 'FeatureCollection', features };
  } catch {
    return { type: 'FeatureCollection', features: [] };
  }
}

export function WorldView() {
  const mapRef = useRef<WorldMapHandle>(null);
  const { flights, loading: flightsLoading, error: flightError } = useFlightData();
  const { quakes, loading: quakesLoading, error: quakeError } = useQuakeData();
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlertCollection>({ type: 'FeatureCollection', features: [] });
  const [weatherAlertsLoading, setWeatherAlertsLoading] = useState(false);
  const [weatherAlertsError, setWeatherAlertsError] = useState('');
  const [rainRadarError, setRainRadarError] = useState('');
  const [rainFrames, setRainFrames] = useState<RainFrame[]>([]);
  const [selectedRainTime, setSelectedRainTime] = useState<number | null>(null);
  const [radarPlaying, setRadarPlaying] = useState(false);
  const [feedErrors, setFeedErrors] = useState<string[]>([]);
  const [counts, setCounts] = useState<Counts>({ aircraft: 0, quakes: 0, satellites: 0, alerts: 0, fires: 0, incidents: 0, transit: 0 });
  const [mode, setMode] = useState<MapMode>('3d');
  const [layers, setLayers] = useState<LayerVisibility>(readSavedLayers);
  const [showLayerCatalog, setShowLayerCatalog] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [measureActive, setMeasureActive] = useState(false);
  const [measureDistanceKm, setMeasureDistanceKm] = useState<number | null>(null);
  const [drawings, setDrawings] = useState<DrawFeatureCollection>(readSavedDrawings);
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [drawDraft, setDrawDraft] = useState<[number, number][]>([]);
  const [routePicking, setRoutePicking] = useState<'start' | 'end' | null>(null);
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);
  const [route, setRoute] = useState<RouteFeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [routeDetails, setRouteDetails] = useState<RouteProperties | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [transitError, setTransitError] = useState('');
  const [windError, setWindError] = useState('');
  const [windCount, setWindCount] = useState(0);
  const [pointer, setPointer] = useState<{ lat: number; lon: number; zoom: number } | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const requestedMode = (event as CustomEvent<unknown>).detail;
      if (requestedMode === '2d' || requestedMode === '3d' || requestedMode === 'satellite') setMode(requestedMode);
    };
    window.addEventListener('aegis-map-mode', handler);
    return () => window.removeEventListener('aegis-map-mode', handler);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAYER_STORAGE_KEY, JSON.stringify(layers));
    } catch (error) {
      console.warn('World View layer preferences could not be saved.', error);
    }
  }, [layers]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAWING_STORAGE_KEY, JSON.stringify(drawings));
    } catch (error) {
      console.warn('World View drawings could not be saved.', error);
    }
  }, [drawings]);

  useEffect(() => {
    if (!layers.weatherAlerts) {
      setWeatherAlertsLoading(false);
      setWeatherAlertsError('');
      return;
    }
    let active = true;
    let controller: AbortController | null = null;
    const loadAlerts = async () => {
      if (controller) return;
      const requestController = new AbortController();
      controller = requestController;
      const timeout = window.setTimeout(() => requestController.abort(), 15_000);
      setWeatherAlertsLoading(true);
      try {
        const response = await fetch('/api/feeds/weather-alerts', { signal: requestController.signal });
        if (!response.ok) {
          const result = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(result?.error || `NOAA weather alerts returned HTTP ${response.status}`);
        }
        const result = await response.json() as WeatherAlertCollection;
        if (result.type !== 'FeatureCollection' || !Array.isArray(result.features)) {
          throw new Error('NOAA weather alerts returned an invalid GeoJSON feed.');
        }
        if (active) {
          setWeatherAlerts(result);
          setWeatherAlertsError(response.headers.get('warning') ? 'NOAA is unavailable; showing cached weather alerts.' : '');
        }
      } catch (error) {
        if (active) setWeatherAlertsError(error instanceof Error ? error.message : String(error));
      } finally {
        window.clearTimeout(timeout);
        if (controller === requestController) controller = null;
        if (active) setWeatherAlertsLoading(false);
      }
    };
    void loadAlerts();
    const timer = window.setInterval(() => void loadAlerts(), 120_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, [layers.weatherAlerts]);

  useEffect(() => {
    if (!showLayerCatalog && searchResults.length === 0) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowLayerCatalog(false);
        setSearchResults([]);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [searchResults.length, showLayerCatalog]);

  useEffect(() => {
    if (!radarPlaying || !layers.rainRadar || rainFrames.length < 2) {
      if (radarPlaying) setRadarPlaying(false);
      return;
    }
    const timer = window.setInterval(() => {
      setSelectedRainTime((current) => {
        const index = rainFrames.findIndex((frame) => frame.time === current);
        return rainFrames[(index + 1 + rainFrames.length) % rainFrames.length]!.time;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [layers.rainRadar, radarPlaying, rainFrames]);

  const searchPlaces = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchText.trim();
    if (query.length < 2) {
      setSearchError('Enter at least two characters.');
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error || `Place search returned HTTP ${response.status}`);
      }
      const result = await response.json() as { results?: PlaceResult[] };
      const places = (result.results ?? []).filter((place) =>
        Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
        && Math.abs(place.latitude) <= 90 && Math.abs(place.longitude) <= 180,
      );
      setSearchResults(places);
      if (places.length === 0) setSearchError('No matching places found.');
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      setSearchLoading(false);
    }
  };

  const selectPlace = (place: PlaceResult) => {
    mapRef.current?.flyTo({ lat: place.latitude, lon: place.longitude, zoom: 8 });
    setSearchText([place.name, place.admin1, place.country_code].filter(Boolean).join(', '));
    setSearchResults([]);
    setSearchError('');
  };

  const locateUser = () => {
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError('This browser does not provide location access.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => mapRef.current?.flyTo({ lat: coords.latitude, lon: coords.longitude, zoom: 9 }),
      (error) => setLocationError(error.message || 'Location access was denied.'),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const toggleFullscreen = async () => {
    try {
      await mapRef.current?.toggleFullscreen();
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : 'Fullscreen mode is unavailable.');
    }
  };

  const handleMapClick = (point: [number, number]) => {
    if (measureActive) return;
    if (routePicking) {
      const points = routePicking === 'start' ? [point] : [...routePoints, point];
      setRoutePoints(points);
      if (routePicking === 'start') {
        setRoutePicking('end');
        setRouteError('Select a destination on the map.');
        return;
      }

      setRoutePicking(null);
      setRouteError('');
      setRouteLoading(true);
      void (async () => {
        try {
          const response = await fetch(`/api/feeds/directions?from=${points[0]!.join(',')}&to=${points[1]!.join(',')}`, {
            signal: AbortSignal.timeout(25_000),
          });
          const result = await response.json() as { error?: string; geometry?: GeoJSON.LineString; properties?: RouteProperties };
          if (!response.ok) throw new Error(result.error || `Route planning returned HTTP ${response.status}`);
          if (result.geometry?.type !== 'LineString' || !Array.isArray(result.geometry.coordinates)
            || !result.properties || !Number.isFinite(result.properties.distance) || !Number.isFinite(result.properties.duration)) {
            throw new Error('Route planner returned invalid route data.');
          }
          const routeFeatures: RouteFeatureCollection['features'] = [
            {
              type: 'Feature',
              geometry: result.geometry,
              properties: { source: result.properties.source, distance: result.properties.distance, duration: result.properties.duration },
            },
            ...points.map((coordinates, index) => ({
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates },
              properties: { kind: index === 0 ? 'start' : 'destination' },
            })),
          ];
          setRoute({ type: 'FeatureCollection', features: routeFeatures });
          setRouteDetails(result.properties);
        } catch (error) {
          setRouteError(error instanceof Error ? error.message : String(error));
          setRoute({ type: 'FeatureCollection', features: [] });
          setRouteDetails(null);
        } finally {
          setRouteLoading(false);
        }
      })();
      return;
    }

    if (!drawMode) return;
    if (drawMode === 'point') {
      setDrawings((current) => ({
        type: 'FeatureCollection',
        features: [...current.features, {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: point },
          properties: { id: crypto.randomUUID(), name: 'Point', color: '#8AF8FF' },
        }],
      }));
      return;
    }
    setDrawDraft((current) => [...current, point]);
  };

  const finishDrawing = () => {
    if (!drawMode || drawMode === 'point') return;
    if (drawDraft.length < (drawMode === 'line' ? 2 : 3)) {
      setRouteError(drawMode === 'line' ? 'A line needs at least two points.' : 'An area needs at least three points.');
      return;
    }
    const coordinates = drawMode === 'polygon'
      ? [...drawDraft, drawDraft[0]!]
      : drawDraft;
    setDrawings((current) => ({
      type: 'FeatureCollection',
      features: [...current.features, {
        type: 'Feature',
        geometry: drawMode === 'line'
          ? { type: 'LineString', coordinates }
          : { type: 'Polygon', coordinates: [coordinates] },
        properties: { id: crypto.randomUUID(), name: drawMode === 'line' ? 'Line' : 'Area', color: '#8AF8FF' },
      }],
    }));
    setDrawDraft([]);
    setDrawMode(null);
    setRouteError('');
  };

  const exportDrawings = () => {
    const blob = new Blob([JSON.stringify(drawings, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aegis-world-view.geojson';
    link.click();
    URL.revokeObjectURL(url);
  };

  const beginDrawing = (nextMode: Exclude<DrawMode, null>) => {
    setMeasureActive(false);
    setMeasureDistanceKm(null);
    setRoutePicking(null);
    setRouteError('');
    setDrawDraft([]);
    setDrawMode(nextMode);
  };

  const beginRoute = () => {
    setMeasureActive(false);
    setMeasureDistanceKm(null);
    setDrawMode(null);
    setDrawDraft([]);
    setRoute({ type: 'FeatureCollection', features: [] });
    setRouteDetails(null);
    setRoutePoints([]);
    setRouteError('Select a starting point on the map.');
    setRoutePicking('start');
  };

  const cancelMapTool = () => {
    setDrawMode(null);
    setDrawDraft([]);
    setRoutePicking(null);
    setRoutePoints([]);
    setRoute({ type: 'FeatureCollection', features: [] });
    setRouteDetails(null);
    setRouteError('');
  };

  const totalActiveLayers = Object.values(layers).filter(Boolean).length;
  const visibleDrawings: DrawFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      ...drawings.features,
      ...drawDraft.map((coordinates, index) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates },
        properties: { id: `draft-${index}`, name: `Draft point ${index + 1}`, color: '#FFC857' },
      })),
    ],
  };
  const systemState = flightsLoading || quakesLoading || weatherAlertsLoading
    ? 'SYNCHRONIZING'
    : flightError || quakeError || weatherAlertsError || rainRadarError || transitError || windError || feedErrors.length > 0
      ? 'DEGRADED'
      : 'LIVE';
  const errors = [flightError, quakeError, weatherAlertsError, rainRadarError, transitError, windError, ...feedErrors].filter(Boolean);

  return (
    <div className="world-shell">
      <GlobeMap
        ref={mapRef}
        flights={flights}
        quakes={quakes}
        weatherAlerts={weatherAlerts}
        selectedRainTime={selectedRainTime}
        onRainFrames={(frames) => {
          setRainFrames(frames);
          setSelectedRainTime((current) => current && frames.some((frame) => frame.time === current)
            ? current
            : frames.at(-1)?.time ?? null);
        }}
        onTransitStatus={(count, errors) => {
          setCounts((current) => ({ ...current, transit: count }));
          setTransitError(errors.length ? `Transit: ${errors.join(' · ')}` : '');
        }}
        onWindStatus={(count, error) => {
          setWindCount(count);
          setWindError(error);
        }}
        drawings={visibleDrawings}
        route={route}
        onMapClick={handleMapClick}
        onRainRadarError={setRainRadarError}
        measureActive={measureActive}
        onMeasureDistance={setMeasureDistanceKm}
        layers={layers}
        mode={mode}
        onFeedStatus={setFeedErrors}
        onCounts={setCounts}
        onPointerChange={setPointer}
      />

      <form className="world-search" role="search" onSubmit={(event) => void searchPlaces(event)}>
        <label className="sr-only" htmlFor="world-place-search">Search a city or place</label>
        <input
          id="world-place-search"
          value={searchText}
          onChange={(event) => { setSearchText(event.target.value); setSearchError(''); }}
          placeholder="SEARCH CITY / PLACE"
          autoComplete="off"
        />
        <button type="submit" disabled={searchLoading} aria-label="Search map">
          {searchLoading ? '…' : 'SEARCH'}
        </button>
        {(searchResults.length > 0 || searchError) && (
          <div className="world-search-results" role="listbox" aria-label="Place search results">
            {searchResults.map((place, index) => (
              <button
                type="button"
                role="option"
                aria-selected="false"
                key={`${place.latitude}:${place.longitude}:${index}`}
                onClick={() => selectPlace(place)}
              >
                <strong>{place.name}</strong>
                <small>{[place.admin1, place.country].filter(Boolean).join(' · ')}</small>
              </button>
            ))}
            {searchError && <p role="status">{searchError}</p>}
          </div>
        )}
      </form>

      {layers.rainRadar && rainFrames.length > 1 && !routePicking && !routeDetails && !drawMode && (
        <div className="world-radar-timeline" aria-label="Radar time selection">
          <label htmlFor="world-radar-time">
            RADAR · {new Date((selectedRainTime ?? rainFrames[rainFrames.length - 1]!.time) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </label>
          <input
            id="world-radar-time"
            type="range"
            min={0}
            max={rainFrames.length - 1}
            value={Math.max(0, rainFrames.findIndex((frame) => frame.time === selectedRainTime))}
            onChange={(event) => setSelectedRainTime(rainFrames[Number(event.target.value)]!.time)}
            aria-label="Select radar frame time"
          />
          <span>{new Date(rainFrames[0]!.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <span>{new Date(rainFrames[rainFrames.length - 1]!.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <button type="button" aria-pressed={radarPlaying} onClick={() => setRadarPlaying((playing) => !playing)}>
            {radarPlaying ? 'PAUSE' : 'PLAY'}
          </button>
        </div>
      )}

      <div className="world-map-actions" aria-label="Map controls">
        <label className="sr-only" htmlFor="world-map-preset">Map view preset</label>
        <select id="world-map-preset" defaultValue="" onChange={(event) => {
          const preset = PRESETS.find((item) => item.label === event.target.value);
          if (preset) mapRef.current?.flyTo(preset);
          event.target.value = '';
        }}>
          <option value="" disabled>VIEW PRESET</option>
          {PRESETS.map((preset) => <option key={preset.label} value={preset.label}>{preset.label}</option>)}
        </select>
        <button type="button" onClick={() => mapRef.current?.reset()} title="Return to global view">HOME</button>
        <button type="button" onClick={locateUser} title="Centre the map on your location">LOCATE</button>
        <button type="button" onClick={() => void toggleFullscreen()} title="Toggle fullscreen map">FULLSCREEN</button>
        <button
          type="button"
          aria-pressed={measureActive}
          onClick={() => {
            setMeasureActive((active) => !active);
            setMeasureDistanceKm(null);
          }}
          title="Measure distance between two map points"
        >
          MEASURE
        </button>
        <button type="button" aria-pressed={drawMode === 'point'} onClick={() => beginDrawing('point')}>DRAW POINT</button>
        <button type="button" aria-pressed={drawMode === 'line'} onClick={() => beginDrawing('line')}>DRAW LINE</button>
        <button type="button" aria-pressed={drawMode === 'polygon'} onClick={() => beginDrawing('polygon')}>DRAW AREA</button>
        {drawMode && drawMode !== 'point' && <button type="button" onClick={finishDrawing}>FINISH</button>}
        <button type="button" aria-pressed={routePicking !== null} onClick={beginRoute} disabled={routeLoading}>
          {routeLoading ? 'ROUTING…' : 'ROUTE'}
        </button>
        <button type="button" onClick={exportDrawings} disabled={drawings.features.length === 0}>EXPORT GEOJSON</button>
        <button type="button" onClick={() => setDrawings({ type: 'FeatureCollection', features: [] })} disabled={drawings.features.length === 0}>
          CLEAR DRAWINGS
        </button>
        {(drawMode || routePicking || routeDetails) && <button type="button" onClick={cancelMapTool}>CANCEL</button>}
      </div>

      <div className="world-map-zoom" role="group" aria-label="Map zoom controls">
        <button type="button" onClick={() => mapRef.current?.zoom(1)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => mapRef.current?.zoom(-1)} aria-label="Zoom out">−</button>
      </div>

      <button
        type="button"
        className="world-layer-catalog-toggle"
        onClick={() => setShowLayerCatalog((visible) => !visible)}
        aria-expanded={showLayerCatalog}
        aria-controls="world-layer-catalog"
      >
        LAYERS · {totalActiveLayers}
      </button>

      {showLayerCatalog && (
        <aside id="world-layer-catalog" className="world-layer-catalog" aria-label="Map layer catalog">
          <div className="world-layer-catalog-heading">
            <strong>MAP LAYERS</strong>
            <button type="button" onClick={() => setShowLayerCatalog(false)} aria-label="Close layer catalog">×</button>
          </div>
          <div className="world-layer-catalog-content">
            {LAYER_GROUPS.map((group) => (
              <section key={group.label}>
                <h3>{group.label}</h3>
                {group.items.map((item) => (
                  <label className="world-layer-row" key={item.key}>
                    <input
                      type="checkbox"
                      checked={layers[item.key]}
                      onChange={() => setLayers((current) => ({ ...current, [item.key]: !current[item.key] }))}
                    />
                    <span><strong>{item.label}</strong><small>{item.source}</small></span>
                  </label>
                ))}
              </section>
            ))}
          </div>
        </aside>
      )}

      <div className="world-tool-rail" aria-label="Quick map layers">
        {([
          ['flights', 'PLANES'],
          ['satellites', 'SATELLITES'],
          ['earthquakes', 'QUAKES'],
          ['weatherAlerts', 'ALERTS'],
          ['rainRadar', 'RADAR'],
          ['satelliteClouds', 'CLOUDS'],
          ['transit', 'TRANSIT'],
          ['dayNight', 'NIGHT'],
          ['marine', 'MARINE'],
          ['fires', 'FIRES'],
          ['conflict', 'INCIDENTS'],
          ['weather', 'WEATHER'],
          ['wind', 'WIND'],
        ] as const).map(([key, label]) => (
          <button
            type="button"
            className={layers[key] ? 'world-layer-toggle active' : 'world-layer-toggle'}
            aria-pressed={layers[key]}
            key={key}
            onClick={() => setLayers((current) => ({ ...current, [key]: !current[key] }))}
          >
            <span aria-hidden="true">{layers[key] ? '◉' : '○'}</span>
            <small>{label}</small>
          </button>
        ))}
      </div>

      <div className="world-map-status">
        <HudFrame title="LIVE TRACKING">
          <div className="map-stat-grid">
            <div className="map-stat"><span className="hud-label">AIRCRAFT</span><strong>{counts.aircraft}</strong></div>
            <div className="map-stat"><span className="hud-label">QUAKES 24H</span><strong>{counts.quakes}</strong></div>
            <div className="map-stat"><span className="hud-label">SATELLITES</span><strong>{counts.satellites}</strong></div>
            <div className="map-stat"><span className="hud-label">WEATHER ALERTS</span><strong>{counts.alerts}</strong></div>
          </div>
          <div className="world-feed-state">
            <span className={`status-dot ${systemState === 'DEGRADED' ? 'degraded' : ''}`} />
            {systemState} · {counts.fires} FIRES · {counts.incidents} INCIDENTS
          </div>
          {measureActive && (
            <div className="world-measure-status" aria-live="polite">
              {measureDistanceKm === null
                ? 'MEASURE · CLICK TWO POINTS'
                : `DISTANCE · ${measureDistanceKm.toLocaleString(undefined, { maximumFractionDigits: 2 })} KM`}
            </div>
          )}
          {drawMode && <div className="world-measure-status" aria-live="polite">
            {drawMode === 'point' ? 'DRAW · CLICK MAP TO SAVE POINT' : `DRAW · CLICK MAP TO ADD ${drawMode === 'line' ? 'LINE' : 'AREA'} POINTS · ${drawDraft.length}`}
          </div>}
          {routePicking && <div className="world-measure-status" aria-live="polite">
            ROUTE · {routePicking === 'start' ? 'SELECT START' : 'SELECT DESTINATION'}
          </div>}
          {layers.transit && <div className="world-measure-status">TRANSIT · {counts.transit} VEHICLES</div>}
          {layers.wind && <div className="world-measure-status">WIND · {windCount} SAMPLES · 10 M</div>}
          {errors.length > 0 && <div className="world-feed-errors">{errors.join(' · ')}</div>}
        </HudFrame>
      </div>

      <div className="world-map-readout" aria-live="polite">
        {pointer
          ? `${pointer.lat.toFixed(3)}°, ${pointer.lon.toFixed(3)}° · Z${pointer.zoom.toFixed(1)}`
          : 'MOVE CURSOR OVER MAP'}
      </div>
      {routeDetails && (
        <aside className="world-route-panel" aria-label="Driving directions">
          <strong>ROUTE · {(routeDetails.distance / 1000).toFixed(1)} KM · {Math.round(routeDetails.duration / 60)} MIN</strong>
          <small>{routeDetails.source} · Driving route estimate</small>
          <ol>
            {routeDetails.steps.map((step, index) => (
              <li key={`${step.name}:${index}`}>
                {step.maneuver ? `${step.maneuver.replaceAll('-', ' ')} ` : ''}
                {step.name || 'Continue'} · {(step.distance / 1000).toFixed(2)} km
              </li>
            ))}
          </ol>
        </aside>
      )}
      {(locationError || weatherAlertsError || rainRadarError || routeError || transitError || windError) && (
        <div className="world-map-notice" role="status">{locationError || routeError || transitError || windError || weatherAlertsError || rainRadarError}</div>
      )}
    </div>
  );
}
