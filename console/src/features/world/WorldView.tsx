import React, { useState } from 'react';
import { HudFrame, GaugeCircle, StatusCard } from '@/components/hud';
import { GlobeMap } from './components/GlobeMap';
import { useFlightData } from './hooks/useFlightData';
import { useQuakeData } from './hooks/useQuakeData';

export function WorldView() {
  const { flights, loading: flightsLoading } = useFlightData();
  const { quakes, loading: quakesLoading } = useQuakeData();
  const [fps, setFps] = useState(60);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <GlobeMap flights={flights} quakes={quakes} />

      {/* HUD overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 10 }}>
        {/* Top-left title */}
        <div style={{ position: 'absolute', top: 20, left: 20, pointerEvents: 'auto' }}>
          <HudFrame title="WORLD VIEW // OSINT">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <StatusCard label="PLANES TRACKED" value={flights.length.toString()} status="online" />
              <StatusCard label="QUAKES 24H" value={quakes.length.toString()} status="online" />
              <StatusCard label="FEED STATUS" value="ONLINE" status="online" sub="NOMINAL" />
            </div>
          </HudFrame>
        </div>

        {/* Right gauges */}
        <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 16, pointerEvents: 'auto' }}>
          <HudFrame title="RENDER FPS">
            <GaugeCircle label="FPS" value={fps.toString()} sub="STABLE" percent={100} size={160} />
          </HudFrame>
          <HudFrame title="API LATENCY">
            <GaugeCircle label="LATENCY" value="42ms" sub="NOMINAL" percent={30} size={160} />
          </HudFrame>
          <HudFrame title="ENTITIES">
            <GaugeCircle label="COUNT" value={(flights.length + quakes.length).toString()} sub="TOTAL" percent={Math.min((flights.length + quakes.length) / 5, 100)} size={160} />
          </HudFrame>
        </div>

        {/* Bottom status bar */}
        <div style={{
          position: 'absolute', bottom: 20, left: 20, right: 20,
          textAlign: 'center', fontSize: '11px', letterSpacing: '3px',
          color: 'var(--text-dim)', fontFamily: 'Rajdhani, monospace', textTransform: 'uppercase',
        }}>
          WORLD VIEW // REALTIME OSINT / FLIGHTS: {flights.length} | QUAKES: {quakes.length} | STATUS: {flightsLoading || quakesLoading ? 'LOADING' : 'LIVE'}
        </div>
      </div>
    </div>
  );
}
