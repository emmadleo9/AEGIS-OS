import { useEffect, useState } from 'react';
import { HudFrame } from '@/components/hud';
import { GlobeMap } from './components/GlobeMap';
import { useFlightData } from './hooks/useFlightData';
import { useQuakeData } from './hooks/useQuakeData';

type MapMode = '2d' | '3d' | 'satellite';
type Counts = { aircraft: number; quakes: number; satellites: number };

export function WorldView() {
  const { flights, loading: flightsLoading, error: flightError } = useFlightData();
  const { quakes, loading: quakesLoading, error: quakeError } = useQuakeData();
  const [feedErrors, setFeedErrors] = useState<string[]>([]);
  const [counts, setCounts] = useState<Counts>({ aircraft: 0, quakes: 0, satellites: 0 });
  const [mode, setMode] = useState<MapMode>('3d');
  const [layers, setLayers] = useState({ flights: true, satellites: true, earthquakes: true, weather: false, conflict: true, marine: true });

  useEffect(() => {
    const handler = (event: Event) => setMode((event as CustomEvent<MapMode>).detail);
    window.addEventListener('aegis-map-mode', handler);
    return () => window.removeEventListener('aegis-map-mode', handler);
  }, []);

  return (
    <div className="world-shell">
      <GlobeMap
        flights={flights}
        quakes={quakes}
        layers={layers}
        mode={mode}
        onFeedStatus={setFeedErrors}
        onCounts={setCounts}
      />
      <div className="world-tool-rail" aria-label="Map layers">
        {([
          ['flights', 'PLANES'],
          ['satellites', 'SATELLITES'],
          ['earthquakes', 'QUAKES'],
          ['marine', 'MARINE'],
          ['conflict', 'CONFLICT'],
          ['weather', 'WEATHER'],
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
          <div className="map-stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="map-stat"><span className="hud-label">AIRCRAFT</span><strong>{counts.aircraft}</strong></div>
            <div className="map-stat"><span className="hud-label">QUAKES 24H</span><strong>{counts.quakes}</strong></div>
            <div className="map-stat"><span className="hud-label">SATELLITES</span><strong>{counts.satellites}</strong></div>
          </div>
          <div className="world-feed-state"><span className="status-dot" /> TRACKING: {counts.aircraft} AIRCRAFT | {counts.quakes} QUAKES 24H | {counts.satellites} SATELLITES — {flightsLoading || quakesLoading ? 'SYNCHRONIZING' : 'LIVE'}</div>
          {(flightError || quakeError || feedErrors.length > 0) && <div className="world-feed-errors">{[flightError, quakeError, ...feedErrors].filter(Boolean).join(' · ')}</div>}
        </HudFrame>
      </div>
    </div>
  );
}
