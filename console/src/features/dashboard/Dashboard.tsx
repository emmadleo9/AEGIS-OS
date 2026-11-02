import { useEffect, useState } from 'react';
import { GaugeCircle, HudFrame, StatusCard } from '@/components/hud';
import { useFlightData } from '@/features/world/hooks/useFlightData';
import { useQuakeData } from '@/features/world/hooks/useQuakeData';

type SystemStats = {
  cpuLoad: number;
  memoryLoad: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  diskLoad: number;
  batteryPercent: number | null;
  batteryCharging: boolean | null;
  timestamp: string;
};

type BatteryManager = {
  level: number;
  charging: boolean;
  addEventListener: (type: 'levelchange' | 'chargingchange', listener: () => void) => void;
  removeEventListener: (type: 'levelchange' | 'chargingchange', listener: () => void) => void;
};

function useBattery() {
  const [battery, setBattery] = useState<{ percent: number; charging: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    let manager: BatteryManager | undefined;
    const update = () => {
      if (active && manager) setBattery({ percent: Math.round(manager.level * 100), charging: manager.charging });
    };
    const batteryNavigator = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (batteryNavigator.getBattery) {
      void batteryNavigator.getBattery().then((result) => {
        manager = result;
        update();
        manager.addEventListener('levelchange', update);
        manager.addEventListener('chargingchange', update);
      }).catch(() => setBattery(null));
    }

    return () => {
      active = false;
      manager?.removeEventListener('levelchange', update);
      manager?.removeEventListener('chargingchange', update);
    };
  }, []);

  return battery;
}

export function Dashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [apiError, setApiError] = useState('');
  const battery = useBattery();
  const { flights, error: flightError } = useFlightData();
  const { quakes, error: quakeError } = useQuakeData();

  useEffect(() => {
    let active = true;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      const started = performance.now();
      try {
        const response = await fetch('/api/system-stats', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Gateway returned HTTP ${response.status}`);
        const result = await response.json() as SystemStats;
        if (!active) return;
        setStats(result);
        setLatency(Math.round(performance.now() - started));
        setApiError('');
      } catch (reason) {
        if (active) {
          setLatency(Math.round(performance.now() - started));
          setApiError(reason instanceof Error ? reason.message : String(reason));
        }
      } finally {
        pending = false;
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const batteryValue = battery ? `${battery.percent}%` : 'N/A';
  const batterySub = battery ? (battery.charging ? 'CHARGING' : 'ON BATTERY') : 'BROWSER API UNAVAILABLE';
  const entityCount = flights.length + quakes.length;

  return (
    <div className="dashboard-page">
      <div className="aegis-grid aegis-grid-4">
        <StatusCard label="SYSTEM" value={stats ? 'ONLINE' : 'CONNECTING'} sub={apiError || (stats ? 'GATEWAY TELEMETRY LIVE' : 'WAITING FOR GATEWAY')} status={stats ? 'online' : apiError ? 'offline' : 'warning'} />
        <StatusCard label="ENTITIES TRACKED" value={String(entityCount)} sub={flightError || quakeError || `${flights.length} AIRCRAFT / ${quakes.length} QUAKES`} status={flightError || quakeError ? 'warning' : 'online'} />
        <StatusCard label="API LATENCY" value={latency === null ? '--' : `${latency}ms`} sub={apiError ? 'GATEWAY UNAVAILABLE' : 'MEASURED ROUND TRIP'} status={apiError ? 'offline' : 'online'} />
        <StatusCard label="BATTERY" value={batteryValue} sub={batterySub} status={battery && battery.percent < 15 && !battery.charging ? 'warning' : 'online'} />
      </div>

      <div className="aegis-grid aegis-grid-3 aegis-section">
        <HudFrame title="PROCESSOR">
          <GaugeCircle label="CPU LOAD" value={stats ? `${stats.cpuLoad.toFixed(0)}%` : '--'} sub="SYSTEM-WIDE" percent={stats?.cpuLoad ?? 0} size={190} />
        </HudFrame>
        <HudFrame title="MEMORY">
          <GaugeCircle label="MEMORY" value={stats ? `${stats.memoryLoad.toFixed(0)}%` : '--'} sub={stats ? `${stats.memoryUsedGb.toFixed(1)} / ${stats.memoryTotalGb.toFixed(1)} GB` : 'WAITING FOR TELEMETRY'} percent={stats?.memoryLoad ?? 0} size={190} />
        </HudFrame>
        <HudFrame title="STORAGE">
          <GaugeCircle label="DISK USED" value={stats ? `${stats.diskLoad.toFixed(0)}%` : '--'} sub="SYSTEM VOLUMES" percent={stats?.diskLoad ?? 0} size={190} />
        </HudFrame>
      </div>

      <div className="dashboard-note hud-label">
        HOST METRICS REFRESH EVERY 3 SECONDS // PUBLIC FEED COUNTS REFRESH INDEPENDENTLY
      </div>
    </div>
  );
}
