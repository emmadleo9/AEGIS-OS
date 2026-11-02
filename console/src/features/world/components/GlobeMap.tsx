import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';
import type { Flight } from '../hooks/useFlightData';
import type { Quake } from '../hooks/useQuakeData';

type MapMode = '2d' | '3d' | 'satellite';
type LayerVisibility = { flights: boolean; satellites: boolean; earthquakes: boolean; weather: boolean; conflict: boolean; marine: boolean };
type Satellite = { id: number; name: string; lat: number; lon: number };
type GlobeMapProps = {
  flights: Flight[];
  quakes: Quake[];
  layers: LayerVisibility;
  mode: MapMode;
  onFeedStatus: (errors: string[]) => void;
  onCounts: (counts: { aircraft: number; quakes: number; satellites: number }) => void;
};
type PointFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, string | number>>;
const empty: PointFeatureCollection = { type: 'FeatureCollection', features: [] };
const cities = [
  { name: 'London', lat: 51.5072, lon: -0.1276 },
  { name: 'New York', lat: 40.7128, lon: -74.006 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { name: 'Nairobi', lat: -1.2921, lon: 36.8219 },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
];
// Major shipping lanes as rough great-circle polylines (mock geojson — no free marine API)
const marineLanes: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Suez–Malacca' }, geometry: { type: 'LineString', coordinates: [[32.5, 30], [43, 12.5], [57, 6], [70, 6], [80, 6], [95, 5], [103, 1.3], [110, 2], [120, 10], [122, 31]] } },
    { type: 'Feature', properties: { name: 'Transatlantic' }, geometry: { type: 'LineString', coordinates: [[-74, 40.5], [-50, 42], [-30, 45], [-10, 48], [-5.5, 49.5]] } },
    { type: 'Feature', properties: { name: 'Panama–Asia' }, geometry: { type: 'LineString', coordinates: [[-79.5, 9], [-100, 14], [-140, 20], [-160, 28], [-180, 32], [160, 34], [140, 32], [125, 28], [122, 31]] } },
    { type: 'Feature', properties: { name: 'Cape Route' }, geometry: { type: 'LineString', coordinates: [[4, 51.5], [-5, 40], [-15, 20], [-25, 0], [-30, -20], [-18.5, -34.5], [20, -38], [35, -30], [45, -12], [55, -4]] } },
    { type: 'Feature', properties: { name: 'Strait of Hormuz' }, geometry: { type: 'LineString', coordinates: [[56.5, 26.5], [57.5, 25.5], [58.5, 24], [60, 23]] } },
  ],
};

const STYLES: Record<MapMode, string> = {
  '2d': 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  '3d': 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  satellite: 'https://basemaps.cartocdn.com/gl/satellite-gl-style/style.json',
};

export function GlobeMap({ flights, quakes, layers, mode, onFeedStatus, onCounts }: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const feedsRef = useRef({ flights, quakes, satellites: empty as PointFeatureCollection, weather: empty, conflict: empty });
  feedsRef.current.flights = flights;
  feedsRef.current.quakes = quakes;
  const visibilityRef = useRef(layers);
  visibilityRef.current = layers;
  const onFeedStatusRef = useRef(onFeedStatus);
  onFeedStatusRef.current = onFeedStatus;
  const onCountsRef = useRef(onCounts);
  onCountsRef.current = onCounts;
  const updateRef = useRef<() => void>(() => undefined);

  updateRef.current = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const current = feedsRef.current;
    const flightPoints = current.flights.map((flight) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [flight.lon, flight.lat] as [number, number] },
      properties: { callsign: flight.callsign, icao24: flight.icao24, heading: 0 },
    }));
    const clusters = new Supercluster<{ callsign: string; icao24: string; heading?: number }, { point_count: number }>({ radius: 36, maxZoom: 16 });
    clusters.load(flightPoints);
    const zoom = Math.floor(map.getZoom());
    const bounds = map.getBounds();
    const clusterPoints = clusters.getClusters([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], zoom);
    const setSource = (id: string, data: GeoJSON.FeatureCollection) => {
      const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (source) void source.setData(data as never);
    };
    setSource('aegis-flights', { type: 'FeatureCollection', features: clusterPoints as PointFeatureCollection['features'] });
    setSource('aegis-quakes', {
      type: 'FeatureCollection',
      features: current.quakes.map((quake) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [quake.lon, quake.lat] as [number, number] },
        properties: { magnitude: quake.magnitude, place: quake.place },
      })),
    });
    setSource('aegis-satellites', current.satellites);
    setSource('aegis-weather', current.weather);
    setSource('aegis-conflict', current.conflict);
    onCountsRef.current({ aircraft: current.flights.length, quakes: current.quakes.length, satellites: (current.satellites.features as unknown as []).length });
    const visibility: Record<string, boolean> = {
      'aegis-flights-layer': visibilityRef.current.flights,
      'aegis-flights-glow': visibilityRef.current.flights,
      'aegis-quakes-layer': visibilityRef.current.earthquakes,
      'aegis-quake-pulse': visibilityRef.current.earthquakes,
      'aegis-satellites-layer': visibilityRef.current.satellites,
      'aegis-satellite-trails': visibilityRef.current.satellites,
      'aegis-weather-layer': visibilityRef.current.weather,
      'aegis-conflict-layer': visibilityRef.current.conflict,
      'aegis-marine-layer': visibilityRef.current.marine,
      'aegis-marine-labels': visibilityRef.current.marine,
    };
    for (const [layer, enabled] of Object.entries(visibility)) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', enabled ? 'visible' : 'none');
    }
  };

  // Map lifecycle (created once per style/mode change)
  useEffect(() => {
    if (!containerRef.current) return;
    setReady(false);
    const previous = mapRef.current;
    if (previous) { previous.remove(); mapRef.current = null; }
    const map = new maplibregl.Map({ container: containerRef.current, style: STYLES[mode], center: [0, 20], zoom: 0.5, minZoom: 0.5, maxZoom: 12, attributionControl: false });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.once('load', () => {
      if (mode === '3d') {
        map.setProjection({ type: 'globe' });
      } else {
        map.setProjection({ type: 'mercator' });
      }
      map.flyTo({ center: [0, 20], zoom: 2, duration: 2000, essential: true });
      map.addSource('aegis-flights', { type: 'geojson', data: empty as never });
      map.addLayer({ id: 'aegis-flights-glow', type: 'circle', source: 'aegis-flights', paint: { 'circle-radius': 14, 'circle-color': '#8AF8FF', 'circle-opacity': .08, 'circle-blur': .6 } });
      map.addLayer({
        id: 'aegis-flights-layer', type: 'symbol', source: 'aegis-flights',
        layout: {
          'text-field': ['case', ['has', 'point_count'], ['get', 'point_count_abbreviated'], '▲'],
          'text-size': ['case', ['has', 'point_count'], 11, 14],
          'text-allow-overlap': true,
          'text-rotate': ['get', 'heading'],
          'text-rotation-alignment': 'map',
        },
        paint: { 'text-color': '#8AF8FF', 'text-halo-color': '#050A0E', 'text-halo-width': 1.4 },
      });
      map.addSource('aegis-quakes', { type: 'geojson', data: empty as never });
      map.addLayer({ id: 'aegis-quake-pulse', type: 'circle', source: 'aegis-quakes', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 0, 7, 6, 20], 'circle-color': '#FF5F6D', 'circle-opacity': .18 } });
      map.addLayer({ id: 'aegis-quakes-layer', type: 'circle', source: 'aegis-quakes', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 0, 3, 6, 10], 'circle-color': ['interpolate', ['linear'], ['get', 'magnitude'], 0, '#FFC857', 3, '#FF8B45', 5, '#FF5F6D'], 'circle-opacity': .9, 'circle-stroke-color': '#050A0E', 'circle-stroke-width': 1 } });
      map.addSource('aegis-marine', { type: 'geojson', data: marineLanes as never });
      map.addLayer({ id: 'aegis-marine-layer', type: 'line', source: 'aegis-marine', layout: { 'line-join': 'round' }, paint: { 'line-color': '#4FC3F7', 'line-width': 1.4, 'line-opacity': .45, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'aegis-marine-labels', type: 'symbol', source: 'aegis-marine', layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-size': 9 }, paint: { 'text-color': '#4FC3F7', 'text-halo-color': '#050A0E', 'text-halo-width': 1 } });
      map.addSource('aegis-satellites', { type: 'geojson', data: empty as never });
      map.addLayer({ id: 'aegis-satellite-trails', type: 'circle', source: 'aegis-satellites', paint: { 'circle-radius': 11, 'circle-color': '#FFFFFF', 'circle-opacity': .1, 'circle-blur': .8 } });
      map.addLayer({ id: 'aegis-satellites-layer', type: 'circle', source: 'aegis-satellites', paint: { 'circle-radius': 5, 'circle-color': '#FFFFFF', 'circle-opacity': .95, 'circle-stroke-color': '#050A0E', 'circle-stroke-width': 1 } });
      for (const [id, color, radius] of [['weather', '#65D6A8', 5], ['conflict', '#FF9F45', 6]] as const) {
        map.addSource(`aegis-${id}`, { type: 'geojson', data: empty as never });
        map.addLayer({ id: `aegis-${id}-layer`, type: 'circle', source: `aegis-${id}`, paint: { 'circle-radius': radius, 'circle-color': color, 'circle-opacity': .85, 'circle-stroke-color': '#050A0E', 'circle-stroke-width': 1 } });
      }
      // popups: aircraft + quakes + satellites
      const popup = new maplibregl.Popup({ closeButton: false, className: 'aegis-popup' });
      const clickHandler = (event: maplibregl.MapLayerMouseEvent) => {
        const feature = event.features?.[0] as (GeoJSON.Feature & { properties?: Record<string, unknown> }) | undefined;
        if (!feature?.properties) return;
        const p = feature.properties;
        if ('icao24' in p || 'callsign' in p) {
          popup.setHTML(`<strong style="color:#8AF8FF">${p.callsign || p.icao24}</strong><br/>ALT ${Number(p.alt_baro ?? p.alt ?? 0).toLocaleString()} ft · SPD ${p.gs ?? '—'} kt`)
            .setLngLat(event.lngLat).addTo(map);
        } else if ('magnitude' in p) {
          popup.setHTML(`<strong style="color:#FF5F6D">M${p.magnitude}</strong><br/>${p.place ?? ''}`)
            .setLngLat(event.lngLat).addTo(map);
        } else if ('name' in p && p.source === 'sat') {
          popup.setHTML(`<strong style="color:#FFF">${p.name}</strong><br/>SATELLITE`)
            .setLngLat(event.lngLat).addTo(map);
        }
      };
      for (const layerId of ['aegis-flights-layer', 'aegis-quakes-layer', 'aegis-satellites-layer', 'aegis-conflict-layer']) {
        map.on('click', layerId, clickHandler);
      }
      setReady(true);
      updateRef.current();
    });
    map.on('moveend', () => updateRef.current());
    return () => { map.remove(); if (mapRef.current === map) mapRef.current = null; };
  }, [mode]);

  useEffect(() => { if (ready) updateRef.current(); }, [flights, quakes, layers, ready]);

  useEffect(() => {
    let active = true;
    const updateFeeds = async () => {
      const failures: string[] = [];
      const request = async <T,>(url: string): Promise<T | null> => {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return await response.json() as T;
        } catch (reason) {
          failures.push(reason instanceof Error ? reason.message : String(reason));
          return null;
        }
      };

      const [satelliteFeed, weatherResults, conflictResult] = await Promise.all([
        request<{ satellites?: Satellite[] }>('/api/satellites'),
        Promise.all(cities.map(async (city) => ({
          city,
          data: await request<{ current?: { temperature_2m?: number } }>(`/api/weather?latitude=${city.lat}&longitude=${city.lon}`),
        }))),
        request<{ features?: Array<{ geometry?: { coordinates?: number[] }; properties?: { name?: string; url?: string } }> }>('/api/feeds/gdelt'),
      ]);
      if (!active) return;
      onFeedStatusRef.current(failures);
      feedsRef.current.satellites = {
        type: 'FeatureCollection',
        features: (satelliteFeed?.satellites ?? []).map((satellite) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [satellite.lon, satellite.lat] as [number, number] },
          properties: { name: satellite.name, source: 'sat', id: satellite.id },
        })),
      };
      feedsRef.current.weather = { type: 'FeatureCollection', features: weatherResults.flatMap(({ city, data }) => data ? [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [city.lon, city.lat] as [number, number] }, properties: { name: city.name, temperature: data.current?.temperature_2m ?? '—' } }] : []) };
      feedsRef.current.conflict = {
        type: 'FeatureCollection', features: (conflictResult?.features ?? []).flatMap((feature) => {
          const coordinates = feature.geometry?.coordinates;
          return coordinates && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])
            ? [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [coordinates[0]!, coordinates[1]!] as [number, number] }, properties: { name: feature.properties?.name ?? 'Public event' } }]
            : [];
        })
      };
      updateRef.current();
    };
    void updateFeeds();
    const timer = window.setInterval(() => void updateFeeds(), 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  // radar sweep ticker (requestAnimationFrame-driven re-render pulse)
  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      if (frame % 600 === 0) updateRef.current();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  return (
    <>
      <div id="world-main-map" ref={containerRef} className="world-map-canvas" style={{ height: 'calc(100vh - 120px)', width: '100%' }} />
      <div className="world-mode-switch" role="group" aria-label="Map mode">
        <ModeButton mode={mode} value="2d" label="2D" />
        <ModeButton mode={mode} value="3d" label="3D GLOBE" />
        <ModeButton mode={mode} value="satellite" label="SATELLITE" />
      </div>
    </>
  );
}

function ModeButton({ mode, value, label }: { mode: MapMode; value: MapMode; label: string }) {
  // mode switching is handled by parent via layers-less state; use DOM event through custom event
  return (
    <button
      type="button"
      className={mode === value ? 'active' : ''}
      onClick={() => window.dispatchEvent(new CustomEvent('aegis-map-mode', { detail: value }))}
    >
      {label}
    </button>
  );
}
