import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Flight } from '../hooks/useFlightData';
import type { Quake } from '../hooks/useQuakeData';

interface GlobeMapProps {
  flights: Flight[];
  quakes: Quake[];
}

export function GlobeMap({ flights, quakes }: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [0, 0],
      zoom: 1.5,
      pitch: 0,
      projection: 'globe' as any,
    });
    mapRef.current = map;
    map.on('load', () => {
      map.setProjection({ type: 'globe' } as any);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Flights layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const srcId = 'flights';
    if (map.getSource(srcId)) {
      (map.getSource(srcId) as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: flights.map(f => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
          properties: { icao24: f.icao24, alt: f.alt, heading: f.heading, callsign: f.callsign },
        })),
      });
      return;
    }
    map.addSource(srcId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
      id: 'flights-layer',
      type: 'symbol',
      source: srcId,
      layout: {
        'icon-image': 'airport-15',
        'icon-allow-overlap': true,
      },
    });
  }, [flights]);

  // Quakes layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const srcId = 'quakes';
    const data = {
      type: 'FeatureCollection' as const,
      features: quakes.map(q => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [q.lon, q.lat] },
        properties: { mag: q.magnitude, place: q.place },
      })),
    };
    if (map.getSource(srcId)) {
      (map.getSource(srcId) as maplibregl.GeoJSONSource).setData(data as any);
      return;
    }
    map.addSource(srcId, { type: 'geojson', data: data as any });
    map.addLayer({
      id: 'quakes-layer',
      type: 'circle',
      source: srcId,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 0, 4, 8, 24],
        'circle-color': ['interpolate', ['linear'], ['get', 'mag'], 0, '#FFD700', 5, '#FF4500', 8, '#FF0000'],
        'circle-opacity': 0.7,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#8AF8FF',
      },
    });
  }, [quakes]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
