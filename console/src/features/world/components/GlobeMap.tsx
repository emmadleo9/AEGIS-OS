import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Flight } from '../hooks/useFlightData';
import type { Quake } from '../hooks/useQuakeData';

type GlobeMapProps = { flights: Flight[]; quakes: Quake[] };
type PointFeatureCollection = { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; geometry: { type: 'Point'; coordinates: number[] }; properties: Record<string, string | number> }> };
const empty: PointFeatureCollection = { type: 'FeatureCollection', features: [] };

export function GlobeMap({ flights, quakes }: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const updateRef = useRef(() => undefined);
  updateRef.current = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const aircraft = map.getSource('aegis-flights') as maplibregl.GeoJSONSource | undefined;
    const events = map.getSource('aegis-quakes') as maplibregl.GeoJSONSource | undefined;
    aircraft?.setData({ type: 'FeatureCollection', features: flights.map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lon, f.lat] }, properties: { callsign: f.callsign } })) });
    events?.setData({ type: 'FeatureCollection', features: quakes.map((q) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [q.lon, q.lat] }, properties: { magnitude: q.magnitude, place: q.place } })) });
  };
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({ container: containerRef.current, style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', center: [10, 12], zoom: 1.25, minZoom: 1 });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    map.once('load', () => {
      map.setProjection({ type: 'globe' } as never);
      map.addSource('aegis-flights', { type: 'geojson', data: empty as never });
      map.addLayer({ id: 'aegis-flights-layer', type: 'circle', source: 'aegis-flights', paint: { 'circle-radius': 3.5, 'circle-color': '#8AF8FF', 'circle-opacity': .9, 'circle-stroke-color': '#050A0E', 'circle-stroke-width': 1 } });
      map.addSource('aegis-quakes', { type: 'geojson', data: empty as never });
      map.addLayer({ id: 'aegis-quakes-layer', type: 'circle', source: 'aegis-quakes', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 0, 3, 6, 15], 'circle-color': '#FFC857', 'circle-opacity': .72, 'circle-stroke-color': '#8AF8FF', 'circle-stroke-width': 1 } });
      updateRef.current();
    });
    return () => { map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => { updateRef.current(); }, [flights, quakes]);
  return <div id="globe" ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}

