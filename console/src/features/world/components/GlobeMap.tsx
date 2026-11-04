import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';
import type { Flight } from '../hooks/useFlightData';
import type { Quake } from '../hooks/useQuakeData';

type MapMode = '2d' | '3d' | 'satellite';
type LayerVisibility = { flights: boolean; satellites: boolean; earthquakes: boolean; weather: boolean; weatherAlerts: boolean; rainRadar: boolean; satelliteClouds: boolean; waterVapor: boolean; wind: boolean; transit: boolean; conflict: boolean; marine: boolean; fires: boolean; dayNight: boolean; buildings3d: boolean; terrain: boolean };
type Satellite = { id: number; name: string; lat: number; lon: number };
type RainFrame = { tileUrl: string; time: number };
type TransitFeedResponse = {
  vehicles?: { id: string; route?: string; label?: string; mode?: string; source?: string; lat: number; lon: number; bearing?: number; speed?: number }[];
  feeds?: { feed: string; error?: string }[];
};
type WindFeedResponse = GeoJSON.FeatureCollection<GeoJSON.Point, { speed: number; direction: number; bearing: number; source: string; time: string }>;
export type WeatherAlertCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, string | number>>;
type NightMask = GeoJSON.FeatureCollection<GeoJSON.Polygon, { source: string }>;
type DrawFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, string | number>>;
type RouteFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, string | number>>;
export type WorldMapHandle = {
  flyTo: (location: { lat: number; lon: number; zoom?: number }) => void;
  reset: () => void;
  zoom: (direction: 1 | -1) => void;
  toggleFullscreen: () => Promise<void>;
};
type GlobeMapProps = {
  flights: Flight[];
  quakes: Quake[];
  weatherAlerts: WeatherAlertCollection;
  selectedRainTime: number | null;
  onRainFrames: (frames: RainFrame[]) => void;
  onTransitStatus: (count: number, errors: string[]) => void;
  onWindStatus: (count: number, error: string) => void;
  drawings: DrawFeatureCollection;
  route: RouteFeatureCollection;
  onMapClick: (point: [number, number]) => void;
  onRainRadarError: (message: string) => void;
  measureActive: boolean;
  onMeasureDistance: (distanceKm: number | null) => void;
  layers: LayerVisibility;
  mode: MapMode;
  onFeedStatus: (errors: string[]) => void;
  onCounts: (counts: { aircraft: number; quakes: number; satellites: number; alerts: number; fires: number; incidents: number; transit: number }) => void;
  onPointerChange: (coordinates: { lat: number; lon: number; zoom: number }) => void;
};
type PointFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, string | number>>;
const empty: PointFeatureCollection = { type: 'FeatureCollection', features: [] };
const emptyAlerts: WeatherAlertCollection = { type: 'FeatureCollection', features: [] };
const emptyNightMask: NightMask = { type: 'FeatureCollection', features: [] };
const emptyMeasure: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const emptyDrawings: DrawFeatureCollection = { type: 'FeatureCollection', features: [] };
const emptyRoute: RouteFeatureCollection = { type: 'FeatureCollection', features: [] };

function distanceKm(start: [number, number], end: [number, number]): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(end[1] - start[1]);
  const longitudeDelta = radians(end[0] - start[0]);
  const latitude1 = radians(start[1]);
  const latitude2 = radians(end[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371.0088 * Math.atan2(Math.sqrt(Math.min(1, haversine)), Math.sqrt(1 - Math.min(1, haversine)));
}

function buildNightMask(): NightMask {
  const now = new Date();
  const dayOfYear = Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86_400_000,
  );
  const declination = 23.44 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
  const declinationRadians = declination * Math.PI / 180;
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
  const subsolarLongitude = ((12 - utcHours) * 15 + 540) % 360 - 180;
  const tangent = Math.tan(declinationRadians);
  const denominator = Math.abs(tangent) < 1e-6 ? (tangent < 0 ? -1e-6 : 1e-6) : tangent;
  const coordinates: [number, number][] = [];
  for (let longitude = -180; longitude <= 180; longitude += 2) {
    const hourAngle = (longitude - subsolarLongitude) * Math.PI / 180;
    const latitude = Math.atan(-Math.cos(hourAngle) / denominator) * 180 / Math.PI;
    coordinates.push([longitude, latitude]);
  }
  const darkSide = declination >= 0 ? -90 : 90;
  coordinates.push([180, darkSide], [-180, darkSide], coordinates[0]!);
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coordinates] },
      properties: { source: 'Astronomical solar terminator' },
    }],
  };
}
const cities = [
  { name: 'London', lat: 51.5072, lon: -0.1276 },
  { name: 'New York', lat: 40.7128, lon: -74.006 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { name: 'Nairobi', lat: -1.2921, lon: 36.8219 },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
];
// Reference corridors only; live vessel positions require an AIS feed.
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

const STYLES: Record<Exclude<MapMode, 'satellite'>, string> = {
  '2d': 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  '3d': 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'aegis-satellite-base': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
  },
  layers: [{ id: 'aegis-satellite-base', type: 'raster', source: 'aegis-satellite-base' }],
};

export const GlobeMap = forwardRef<WorldMapHandle, GlobeMapProps>(function GlobeMap(
  { flights, quakes, weatherAlerts, selectedRainTime, onRainFrames, onTransitStatus, onWindStatus, drawings, route, onMapClick, onRainRadarError, measureActive, onMeasureDistance, layers, mode, onFeedStatus, onCounts, onPointerChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const feedsRef = useRef({ flights, quakes, weatherAlerts, satellites: empty as PointFeatureCollection, weather: empty, conflict: empty, fires: empty, transit: empty, wind: empty, dayNight: emptyNightMask });
  feedsRef.current.flights = flights;
  feedsRef.current.quakes = quakes;
  feedsRef.current.weatherAlerts = weatherAlerts;
  const visibilityRef = useRef(layers);
  visibilityRef.current = layers;
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const routeRef = useRef(route);
  routeRef.current = route;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const measureActiveRef = useRef(measureActive);
  measureActiveRef.current = measureActive;
  const measurePointsRef = useRef<[number, number][]>([]);
  const onMeasureDistanceRef = useRef(onMeasureDistance);
  onMeasureDistanceRef.current = onMeasureDistance;
  const onRainFramesRef = useRef(onRainFrames);
  onRainFramesRef.current = onRainFrames;
  const onTransitStatusRef = useRef(onTransitStatus);
  onTransitStatusRef.current = onTransitStatus;
  const onWindStatusRef = useRef(onWindStatus);
  onWindStatusRef.current = onWindStatus;
  const selectedRainTimeRef = useRef(selectedRainTime);
  selectedRainTimeRef.current = selectedRainTime;
  const onFeedStatusRef = useRef(onFeedStatus);
  onFeedStatusRef.current = onFeedStatus;
  const onCountsRef = useRef(onCounts);
  onCountsRef.current = onCounts;
  const onPointerChangeRef = useRef(onPointerChange);
  onPointerChangeRef.current = onPointerChange;
  const updateRef = useRef<() => void>(() => undefined);

  useImperativeHandle(ref, () => ({
    flyTo: ({ lat, lon, zoom = 8 }) => {
      const map = mapRef.current;
      if (!map) return;
      const transition = { center: [lon, lat] as [number, number], zoom, duration: 1200, essential: true };
      if (mode === '3d') map.easeTo(transition);
      else map.flyTo(transition);
    },
    reset: () => {
      const map = mapRef.current;
      if (!map) return;
      const transition = { center: [0, 20] as [number, number], zoom: mode === '3d' ? 2.8 : 2, pitch: 0, duration: 1000, essential: true };
      if (mode === '3d') map.easeTo(transition);
      else map.flyTo(transition);
    },
    zoom: (direction) => {
      const map = mapRef.current;
      if (map) map.easeTo({ zoom: map.getZoom() + direction, duration: 250 });
    },
    toggleFullscreen: async () => {
      const target = containerRef.current?.parentElement;
      if (!target) return;
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.requestFullscreen();
    },
  }), [mode]);

  updateRef.current = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const current = feedsRef.current;
    const flightPoints = current.flights.map((flight) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [flight.lon, flight.lat] as [number, number] },
      properties: {
        callsign: flight.callsign,
        icao24: flight.icao24,
        heading: flight.heading,
        alt_baro: flight.alt,
        gs: flight.speed,
      },
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
    setSource('aegis-fires', current.fires);
    setSource('aegis-weather-alerts', current.weatherAlerts);
    setSource('aegis-day-night', current.dayNight);
    setSource('aegis-transit', current.transit);
    setSource('aegis-wind', current.wind);
    setSource('aegis-drawings', drawingsRef.current);
    setSource('aegis-route', routeRef.current);
    onCountsRef.current({
      aircraft: current.flights.length,
      quakes: current.quakes.length,
      satellites: current.satellites.features.length,
      alerts: current.weatherAlerts.features.length,
      fires: current.fires.features.length,
      incidents: current.conflict.features.length,
      transit: current.transit.features.length,
    });
    const visibility: Record<string, boolean> = {
      'aegis-flights-layer': visibilityRef.current.flights,
      'aegis-flights-glow': visibilityRef.current.flights,
      'aegis-quakes-layer': visibilityRef.current.earthquakes,
      'aegis-quake-pulse': visibilityRef.current.earthquakes,
      'aegis-satellites-layer': visibilityRef.current.satellites,
      'aegis-satellite-trails': visibilityRef.current.satellites,
      'aegis-weather-layer': visibilityRef.current.weather,
      'aegis-weather-alert-fill': visibilityRef.current.weatherAlerts,
      'aegis-weather-alert-line': visibilityRef.current.weatherAlerts,
      'aegis-rain-radar-layer': visibilityRef.current.rainRadar,
      'aegis-satellite-clouds-layer': visibilityRef.current.satelliteClouds,
      'aegis-water-vapor-layer': visibilityRef.current.waterVapor,
      'aegis-transit-layer': visibilityRef.current.transit,
      'aegis-transit-labels': visibilityRef.current.transit,
      'aegis-wind-layer': visibilityRef.current.wind,
      'aegis-day-night-layer': visibilityRef.current.dayNight,
      'aegis-3d-buildings': visibilityRef.current.buildings3d,
      'aegis-conflict-layer': visibilityRef.current.conflict,
      'aegis-fires-layer': visibilityRef.current.fires,
      'aegis-marine-layer': visibilityRef.current.marine,
      'aegis-marine-labels': visibilityRef.current.marine,
    };
    for (const [layer, enabled] of Object.entries(visibility)) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', enabled ? 'visible' : 'none');
    }
    if (map.getSource('aegis-terrain')) {
      map.setTerrain(visibilityRef.current.terrain ? { source: 'aegis-terrain', exaggeration: 1.15 } : null);
    }
  };

  // Map lifecycle (created once per style/mode change)
  useEffect(() => {
    if (!containerRef.current) return;
    setReady(false);
    const previous = mapRef.current;
    if (previous) { previous.remove(); mapRef.current = null; }
    const map = new maplibregl.Map({ container: containerRef.current, style: mode === 'satellite' ? SATELLITE_STYLE : STYLES[mode], center: [0, 20], zoom: 0.5, minZoom: 0.5, maxZoom: 18, attributionControl: false });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.once('load', () => {
      if (mode === '3d') {
        map.setProjection({ type: 'globe' });
      } else {
        map.setProjection({ type: 'mercator' });
      }
      map.addSource('aegis-terrain', {
        type: 'raster-dem',
        tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 15,
        attribution: 'Terrain data © AWS Terrain Tiles',
      });
      const initialView = { center: [0, 20] as [number, number], zoom: mode === '3d' ? 2.8 : 2, duration: 2000, essential: true };
      if (mode === '3d') map.easeTo(initialView);
      else map.flyTo(initialView);
      map.addSource('aegis-flights', { type: 'geojson', data: empty as never });
      map.addLayer({ id: 'aegis-flights-glow', type: 'circle', source: 'aegis-flights', paint: { 'circle-radius': 14, 'circle-color': '#8AF8FF', 'circle-opacity': .08, 'circle-blur': .6 } });
      map.addLayer({
        id: 'aegis-flights-layer', type: 'symbol', source: 'aegis-flights',
        layout: {
          'text-field': ['case', ['has', 'point_count'], ['get', 'point_count_abbreviated'], '▲'],
          'text-size': ['case', ['has', 'point_count'], 11, 14],
          'text-allow-overlap': true,
          'text-rotate': ['coalesce', ['get', 'heading'], 0],
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
      for (const [id, color, radius] of [['weather', '#65D6A8', 5], ['conflict', '#FF9F45', 6], ['fires', '#FF3D00', 5]] as const) {
        map.addSource(`aegis-${id}`, { type: 'geojson', data: empty as never });
        map.addLayer({ id: `aegis-${id}-layer`, type: 'circle', source: `aegis-${id}`, paint: { 'circle-radius': radius, 'circle-color': color, 'circle-opacity': .85, 'circle-stroke-color': '#050A0E', 'circle-stroke-width': 1 } });
      }
      map.addSource('aegis-transit', { type: 'geojson', data: empty as never });
      map.addLayer({
        id: 'aegis-transit-layer',
        type: 'circle',
        source: 'aegis-transit',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 11, 6],
          'circle-color': ['match', ['get', 'mode'], 'bus', '#5EEAD4', 'rail', '#C4B5FD', 'metro', '#F87171', 'tram', '#FBBF24', '#7DD3FC'],
          'circle-opacity': 0.9,
          'circle-stroke-color': '#07151B',
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({
        id: 'aegis-transit-labels',
        type: 'symbol',
        source: 'aegis-transit',
        minzoom: 10,
        layout: { 'text-field': ['coalesce', ['get', 'route'], ['get', 'label'], ''], 'text-size': 9, 'text-offset': [0, 1.2], 'text-allow-overlap': false },
        paint: { 'text-color': '#5EEAD4', 'text-halo-color': '#07151B', 'text-halo-width': 1.2 },
      });
      map.addSource('aegis-wind', { type: 'geojson', data: empty as never });
      map.addLayer({
        id: 'aegis-wind-layer',
        type: 'symbol',
        source: 'aegis-wind',
        layout: {
          'text-field': '▲',
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 12, 8, 18],
          'text-rotate': ['get', 'bearing'],
          'text-rotation-alignment': 'map',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': ['interpolate', ['linear'], ['get', 'speed'], 0, '#8AF8FF', 10, '#FFC857', 20, '#FF5F6D'],
          'text-halo-color': '#07151B',
          'text-halo-width': 1,
        },
      });
      map.addSource('aegis-weather-alerts', { type: 'geojson', data: emptyAlerts as never });
      map.addLayer({
        id: 'aegis-weather-alert-fill',
        type: 'fill',
        source: 'aegis-weather-alerts',
        paint: {
          'fill-color': ['match', ['get', 'severity'], 'Extreme', '#FF3D00', 'Severe', '#FF5F6D', 'Moderate', '#FFC857', '#8AF8FF'],
          'fill-opacity': 0.16,
        },
      });
      map.addLayer({
        id: 'aegis-weather-alert-line',
        type: 'line',
        source: 'aegis-weather-alerts',
        paint: {
          'line-color': ['match', ['get', 'severity'], 'Extreme', '#FF3D00', 'Severe', '#FF5F6D', 'Moderate', '#FFC857', '#8AF8FF'],
          'line-width': 1.5,
          'line-opacity': 0.8,
        },
      });
      map.addSource('aegis-day-night', { type: 'geojson', data: emptyNightMask as never });
      map.addLayer({
        id: 'aegis-day-night-layer',
        type: 'fill',
        source: 'aegis-day-night',
        paint: { 'fill-color': '#080E2A', 'fill-opacity': 0.3 },
      }, 'aegis-flights-glow');
      const satelliteWms = (layer: string) => `https://nowcoast.noaa.gov/geoserver/observations/satellite/wms?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=${layer}&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=true&SRS=EPSG%3A3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256`;
      map.addSource('aegis-satellite-clouds', {
        type: 'raster',
        tiles: [satelliteWms('global_longwave_imagery_mosaic')],
        tileSize: 256,
        maxzoom: 6,
        attribution: 'Cloud imagery © NOAA/NESDIS GMGSI',
      });
      map.addLayer({
        id: 'aegis-satellite-clouds-layer',
        type: 'raster',
        source: 'aegis-satellite-clouds',
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.62 },
      }, 'aegis-day-night-layer');
      map.addSource('aegis-water-vapor', {
        type: 'raster',
        tiles: [satelliteWms('global_water_vapor_imagery_mosaic')],
        tileSize: 256,
        maxzoom: 6,
        attribution: 'Water vapor imagery © NOAA/NESDIS GMGSI',
      });
      map.addLayer({
        id: 'aegis-water-vapor-layer',
        type: 'raster',
        source: 'aegis-water-vapor',
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.48 },
      }, 'aegis-day-night-layer');
      if (map.getSource('protomaps')) {
        map.addLayer({
          id: 'aegis-3d-buildings',
          type: 'fill-extrusion',
          source: 'protomaps',
          'source-layer': 'buildings',
          minzoom: 14.5,
          layout: { visibility: 'none' },
          paint: {
            'fill-extrusion-color': '#28606C',
            'fill-extrusion-height': ['coalesce', ['to-number', ['get', 'render_height']], ['to-number', ['get', 'height']], 0],
            'fill-extrusion-base': ['coalesce', ['to-number', ['get', 'render_min_height']], ['to-number', ['get', 'min_height']], 0],
            'fill-extrusion-opacity': 0.65,
          },
        }, 'aegis-flights-glow');
      }
      map.addSource('aegis-measure', { type: 'geojson', data: emptyMeasure });
      map.addLayer({
        id: 'aegis-measure-line',
        type: 'line',
        source: 'aegis-measure',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#8AF8FF', 'line-width': 2, 'line-dasharray': [2, 1] },
      });
      map.addLayer({
        id: 'aegis-measure-points',
        type: 'circle',
        source: 'aegis-measure',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': '#8AF8FF', 'circle-stroke-color': '#050A0E', 'circle-stroke-width': 2 },
      });
      map.addSource('aegis-drawings', { type: 'geojson', data: emptyDrawings as never });
      map.addLayer({
        id: 'aegis-drawing-fill',
        type: 'fill',
        source: 'aegis-drawings',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': ['coalesce', ['get', 'color'], '#8AF8FF'], 'fill-opacity': 0.16 },
      });
      map.addLayer({
        id: 'aegis-drawing-line',
        type: 'line',
        source: 'aegis-drawings',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': ['coalesce', ['get', 'color'], '#8AF8FF'], 'line-width': 2, 'line-dasharray': [2, 1] },
      });
      map.addLayer({
        id: 'aegis-drawing-points',
        type: 'circle',
        source: 'aegis-drawings',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': ['coalesce', ['get', 'color'], '#8AF8FF'], 'circle-stroke-color': '#050A0E', 'circle-stroke-width': 1.5 },
      });
      map.addSource('aegis-route', { type: 'geojson', data: emptyRoute as never });
      map.addLayer({
        id: 'aegis-route-line',
        type: 'line',
        source: 'aegis-route',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#FFC857', 'line-width': 4, 'line-opacity': 0.95 },
      });
      map.addLayer({
        id: 'aegis-route-points',
        type: 'circle',
        source: 'aegis-route',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 7, 'circle-color': '#FFC857', 'circle-stroke-color': '#050A0E', 'circle-stroke-width': 2 },
      });
      const popup = new maplibregl.Popup({ closeButton: false, className: 'aegis-popup' });
      const escapeHtml = (value: unknown) => {
        const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
        return text.replace(/[&<>"']/g, (character) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        })[character] ?? character);
      };
      const clickHandler = (event: maplibregl.MapLayerMouseEvent) => {
        if (measureActiveRef.current) return;
        const feature = event.features?.[0] as (GeoJSON.Feature & { properties?: Record<string, unknown> }) | undefined;
        if (!feature?.properties) return;
        const p = feature.properties;
        if ('icao24' in p || 'callsign' in p) {
          popup.setHTML(`<strong style="color:#8AF8FF">${escapeHtml(p.callsign || p.icao24)}</strong><br/>ALT ${Number(p.alt_baro ?? p.alt ?? 0).toLocaleString()} ft · SPD ${escapeHtml(p.gs ?? '—')} kt`)
            .setLngLat(event.lngLat).addTo(map);
        } else if ('magnitude' in p) {
          popup.setHTML(`<strong style="color:#FF5F6D">M${escapeHtml(p.magnitude)}</strong><br/>${escapeHtml(p.place)}`)
            .setLngLat(event.lngLat).addTo(map);
        } else if ('name' in p && p.source === 'sat') {
          popup.setHTML(`<strong style="color:#FFF">${escapeHtml(p.name)}</strong><br/>SATELLITE`)
            .setLngLat(event.lngLat).addTo(map);
        } else if ('severity' in p) {
          popup.setHTML(`<strong style="color:#FF5F6D">${escapeHtml(p.event)}</strong><br/>${escapeHtml(p.severity)} · ${escapeHtml(p.areaDesc)}`)
            .setLngLat(event.lngLat).addTo(map);
        } else if ('mode' in p) {
          const route = p.route ? `<br/>ROUTE ${escapeHtml(p.route)}` : '';
          const provider = p.source ? `<br/>${escapeHtml(p.source)}` : '';
          popup.setHTML(`<strong style="color:#5EEAD4">${escapeHtml(p.mode)} ${escapeHtml(p.label || p.id || 'vehicle')}</strong>${route}${provider}`)
            .setLngLat(event.lngLat).addTo(map);
        } else if ('speed' in p && 'direction' in p) {
          popup.setHTML(`<strong style="color:#8AF8FF">SURFACE WIND</strong><br/>${escapeHtml(p.speed)} m/s · FROM ${escapeHtml(p.direction)}°<br/>${escapeHtml(p.source)}`)
            .setLngLat(event.lngLat).addTo(map);
        } else if ('name' in p) {
          const detail = 'temperature' in p
            ? `TEMP ${escapeHtml(p.temperature)}°`
            : 'date' in p
              ? escapeHtml(p.date)
              : 'GLOBAL MAP LAYER';
          popup.setHTML(`<strong style="color:#8AF8FF">${escapeHtml(p.name)}</strong><br/>${detail}`)
            .setLngLat(event.lngLat).addTo(map);
        }
      };
      for (const layerId of [
        'aegis-flights-layer',
        'aegis-quakes-layer',
        'aegis-satellites-layer',
        'aegis-conflict-layer',
        'aegis-fires-layer',
        'aegis-weather-layer',
        'aegis-marine-layer',
        'aegis-weather-alert-fill',
        'aegis-weather-alert-line',
        'aegis-transit-layer',
        'aegis-wind-layer',
      ]) {
        map.on('click', layerId, clickHandler);
        map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
      }
      map.on('click', (event) => {
        onMapClickRef.current([event.lngLat.lng, event.lngLat.lat]);
      });
      setReady(true);
      updateRef.current();
    });
    map.on('moveend', () => updateRef.current());
    let lastPointerUpdate = 0;
    map.on('mousemove', (event) => {
      const now = performance.now();
      if (now - lastPointerUpdate < 100) return;
      lastPointerUpdate = now;
      onPointerChangeRef.current({ lat: event.lngLat.lat, lon: event.lngLat.lng, zoom: map.getZoom() });
    });
    return () => { map.remove(); if (mapRef.current === map) mapRef.current = null; };
  }, [mode]);

  useEffect(() => { if (ready) updateRef.current(); }, [flights, quakes, weatherAlerts, layers, drawings, route, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource('aegis-measure') as maplibregl.GeoJSONSource | undefined;
    if (!ready || !map || !source || !measureActive) {
      measurePointsRef.current = [];
      if (source) void source.setData(emptyMeasure as never);
      onMeasureDistanceRef.current(null);
      if (map) map.getCanvas().style.cursor = '';
      return;
    }

    const addPoint = (event: maplibregl.MapMouseEvent) => {
      const points = measurePointsRef.current;
      if (points.length === 2) points.length = 0;
      points.push([event.lngLat.lng, event.lngLat.lat]);
      const features: GeoJSON.Feature[] = points.map((coordinates) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates },
        properties: {},
      }));
      if (points.length === 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: points },
          properties: {},
        });
        onMeasureDistanceRef.current(distanceKm(points[0]!, points[1]!));
      } else {
        onMeasureDistanceRef.current(null);
      }
      void source.setData({ type: 'FeatureCollection', features } as never);
    };

    map.getCanvas().style.cursor = 'crosshair';
    map.on('click', addPoint);
    return () => {
      map.off('click', addPoint);
      if (mapRef.current === map) map.getCanvas().style.cursor = '';
    };
  }, [ready, measureActive]);

  useEffect(() => {
    if (!ready) return;
    const refreshTerminator = () => {
      feedsRef.current.dayNight = buildNightMask();
      updateRef.current();
    };
    refreshTerminator();
    const timer = window.setInterval(refreshTerminator, 60_000);
    return () => window.clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    if (!ready || !layers.rainRadar) {
      onRainRadarError('');
      return;
    }

    const map = mapRef.current;
    if (!map) return;
    let active = true;
    let pending = false;
    let controller: AbortController | null = null;
    const loadRadar = async () => {
      if (pending) return;
      pending = true;
      controller = new AbortController();
      const requestController = controller;
      const timeout = window.setTimeout(() => requestController.abort(), 10_000);
      try {
        const response = await fetch('/api/feeds/rain-radar', { signal: requestController.signal });
        if (!response.ok) {
          const result = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(result?.error || `RainViewer radar returned HTTP ${response.status}`);
        }
        const result = await response.json() as { frames?: RainFrame[]; tileUrl?: string; frameTime?: number };
        const frames = Array.isArray(result.frames) ? result.frames : [];
        if (frames.length === 0 && typeof result.tileUrl === 'string' && Number.isFinite(result.frameTime)) {
          frames.push({ tileUrl: result.tileUrl, time: result.frameTime! });
        }
        const validFrame = (frame: RainFrame) => Number.isFinite(frame.time)
          && typeof frame.tileUrl === 'string'
          && /^https:\/\/tilecache\.rainviewer\.com\/v2\/radar\/[a-f0-9]+\/256\/\{z\}\/\{x\}\/\{y\}\/2\/1_1\.png$/i.test(frame.tileUrl);
        if (!frames.length || frames.some((frame) => !validFrame(frame))) {
          throw new Error('RainViewer returned an invalid radar tile URL.');
        }
        if (!active || mapRef.current !== map) return;
        const sortedFrames = frames.sort((a, b) => a.time - b.time);
        onRainFramesRef.current(sortedFrames);
        const selectedFrame = sortedFrames.find((frame) => frame.time === selectedRainTimeRef.current)
          ?? sortedFrames[sortedFrames.length - 1]!;
        if (map.getLayer('aegis-rain-radar-layer')) map.removeLayer('aegis-rain-radar-layer');
        if (map.getSource('aegis-rain-radar')) map.removeSource('aegis-rain-radar');
        map.addSource('aegis-rain-radar', {
          type: 'raster',
          tiles: [selectedFrame.tileUrl],
          tileSize: 256,
          maxzoom: 12,
          attribution: 'RainViewer precipitation radar',
        });
        map.addLayer({
          id: 'aegis-rain-radar-layer',
          type: 'raster',
          source: 'aegis-rain-radar',
          layout: { visibility: visibilityRef.current.rainRadar ? 'visible' : 'none' },
          paint: { 'raster-opacity': 0.65 },
        }, map.getLayer('aegis-day-night-layer') ? 'aegis-day-night-layer' : undefined);
        onRainRadarError(response.headers.get('warning') ? 'RainViewer unavailable; showing its cached radar frame.' : '');
      } catch (error) {
        if (active && !requestController.signal.aborted) {
          onRainRadarError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        window.clearTimeout(timeout);
        if (controller === requestController) controller = null;
        pending = false;
      }
    };

    void loadRadar();
    const timer = window.setInterval(() => void loadRadar(), 5 * 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, [ready, layers.rainRadar, selectedRainTime, onRainRadarError]);

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

      const [satelliteFeed, weatherResults, conflictResult, firesResult] = await Promise.all([
        request<{ satellites?: Satellite[] }>('/api/satellites'),
        Promise.all(cities.map(async (city) => ({
          city,
          data: await request<{ current?: { temperature_2m?: number } }>(`/api/weather?latitude=${city.lat}&longitude=${city.lon}`),
        }))),
        request<{ features?: Array<{ geometry?: { coordinates?: number[] }; properties?: { name?: string; url?: string } }> }>('/api/feeds/gdelt'),
        request<{ events?: Array<{ id: string; title: string; lon: number; lat: number; date: string }> }>('/api/feeds/fires'),
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
      feedsRef.current.fires = { type: 'FeatureCollection', features: (firesResult?.events ?? []).map((fire) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [fire.lon, fire.lat] as [number, number] }, properties: { name: fire.title, date: fire.date } })) };
      updateRef.current();
    };
    void updateFeeds();
    const timer = window.setInterval(() => void updateFeeds(), 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!ready || !layers.transit) {
      feedsRef.current.transit = empty;
      onTransitStatusRef.current(0, []);
      if (ready) updateRef.current();
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    let active = true;
    let request: AbortController | null = null;
    let timer = 0;
    const poll = async () => {
      if (!active || map.getZoom() < 5) {
        feedsRef.current.transit = empty;
        onTransitStatusRef.current(0, []);
        updateRef.current();
        return;
      }
      const bounds = map.getBounds();
      const west = Math.max(-180, bounds.getWest());
      const east = Math.min(180, bounds.getEast());
      const south = Math.max(-85, bounds.getSouth());
      const north = Math.min(85, bounds.getNorth());
      if (west >= east || south >= north) return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const query = new URLSearchParams({ bbox: [west, south, east, north].join(',') });
        const response = await fetch(`/api/feeds/transit?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Transit feed returned HTTP ${response.status}`);
        const result = await response.json() as TransitFeedResponse;
        if (!Array.isArray(result.vehicles) || !Array.isArray(result.feeds)) {
          throw new Error('Transit feed returned invalid data.');
        }
        if (!active || controller.signal.aborted) return;
        feedsRef.current.transit = {
          type: 'FeatureCollection',
          features: result.vehicles.filter((vehicle) => Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lon))
            .map((vehicle) => ({
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [vehicle.lon, vehicle.lat] as [number, number] },
              properties: {
                id: vehicle.id || 'vehicle',
                ...(vehicle.route ? { route: vehicle.route } : {}),
                ...(vehicle.label ? { label: vehicle.label } : {}),
                mode: vehicle.mode || 'transit',
                ...(vehicle.source ? { source: vehicle.source } : {}),
                ...(Number.isFinite(vehicle.bearing) ? { bearing: vehicle.bearing! } : {}),
                ...(Number.isFinite(vehicle.speed) ? { speed: vehicle.speed! } : {}),
              },
            })),
        };
        onTransitStatusRef.current(
          result.vehicles.length,
          result.feeds.filter((feed) => feed.error).map((feed) => `${feed.feed}: ${feed.error}`),
        );
        updateRef.current();
      } catch (error) {
        if (!controller.signal.aborted && active) {
          onTransitStatusRef.current(
            feedsRef.current.transit.features.length,
            [error instanceof Error ? error.message : String(error)],
          );
        }
      } finally {
        if (request === controller) request = null;
      }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void poll(), 500);
    };
    void poll();
    map.on('moveend', schedule);
    const interval = window.setInterval(() => void poll(), 20_000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      map.off('moveend', schedule);
      request?.abort();
    };
  }, [ready, layers.transit]);

  useEffect(() => {
    if (!ready || !layers.wind) {
      feedsRef.current.wind = empty;
      onWindStatusRef.current(0, '');
      if (ready) updateRef.current();
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    let active = true;
    let request: AbortController | null = null;
    let timer = 0;
    const poll = async () => {
      if (!active) return;
      const bounds = map.getBounds();
      const west = Math.max(-180, bounds.getWest());
      const east = Math.min(180, bounds.getEast());
      const south = Math.max(-80, bounds.getSouth());
      const north = Math.min(80, bounds.getNorth());
      if (west >= east || south >= north) return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const query = new URLSearchParams({ bbox: [west, south, east, north].join(',') });
        const response = await fetch(`/api/feeds/wind?${query}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(18_000)]),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(result?.error || `Wind feed returned HTTP ${response.status}`);
        }
        const result = await response.json() as WindFeedResponse;
        if (result.type !== 'FeatureCollection' || !Array.isArray(result.features)) {
          throw new Error('Wind feed returned invalid GeoJSON.');
        }
        if (!active || controller.signal.aborted) return;
        feedsRef.current.wind = {
          type: 'FeatureCollection',
          features: result.features.filter((feature) =>
            feature.geometry?.type === 'Point'
            && feature.geometry.coordinates.every(Number.isFinite)
            && Number.isFinite(feature.properties?.speed)
            && Number.isFinite(feature.properties?.bearing)),
        };
        onWindStatusRef.current(feedsRef.current.wind.features.length, '');
        updateRef.current();
      } catch (error) {
        if (!controller.signal.aborted && active) {
          onWindStatusRef.current(
            feedsRef.current.wind.features.length,
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        if (request === controller) request = null;
      }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void poll(), 500);
    };
    void poll();
    map.on('moveend', schedule);
    const interval = window.setInterval(() => void poll(), 10 * 60_000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      map.off('moveend', schedule);
      request?.abort();
    };
  }, [ready, layers.wind]);

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
      <div id="world-main-map" ref={containerRef} className="world-map-canvas" />
      <div className="world-mode-switch" role="group" aria-label="Map mode">
        <ModeButton mode={mode} value="2d" label="2D" />
        <ModeButton mode={mode} value="3d" label="3D GLOBE" />
        <ModeButton mode={mode} value="satellite" label="SATELLITE" />
      </div>
    </>
  );
});

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
