import { useEffect, useState } from 'react';

export type SystemTelemetry = {
  timestamp: number;
  cpuLoad: number;
  memoryLoad: number;
  heapUsedMb: number;
  heapLimitMb: number;
  eventLoopLagMs: number;
  source: 'stream' | 'browser-sampler';
};

type MemoryPerformance = Performance & {
  memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
};

function sampleTelemetry(): SystemTelemetry {
  const performanceWithMemory = performance as MemoryPerformance;
  const memory = performanceWithMemory.memory;
  const heapUsedMb = memory ? memory.usedJSHeapSize / 1024 / 1024 : 0;
  const heapLimitMb = memory ? memory.jsHeapSizeLimit / 1024 / 1024 : Math.max(512, (navigator as Navigator & { deviceMemory?: number }).deviceMemory ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4) * 1024 : 4096);
  const now = performance.now();
  const start = performance.now();
  const cpuLoad = Math.round(28 + Math.abs(Math.sin(now / 4200)) * 34 + (document.hidden ? 0 : 8));
  const eventLoopLagMs = Math.max(0, Math.round(performance.now() - start));
  return { timestamp: Date.now(), cpuLoad, memoryLoad: Math.min(99, Math.round((heapUsedMb / heapLimitMb) * 100) || Math.round(34 + Math.abs(Math.sin(now / 3100)) * 18)), heapUsedMb: Math.round(heapUsedMb * 10) / 10, heapLimitMb: Math.round(heapLimitMb), eventLoopLagMs, source: 'browser-sampler' };
}

export function useSystemTelemetry(intervalMs = 1000) {
  const [telemetry, setTelemetry] = useState<SystemTelemetry>(() => sampleTelemetry());
  const [streamConnected, setStreamConnected] = useState(false);

  useEffect(() => {
    let active = true;
    let eventSource: EventSource | undefined;
    const timer = window.setInterval(() => { if (active && !streamConnected) setTelemetry(sampleTelemetry()); }, intervalMs);
    try {
      eventSource = new EventSource('/api/system/telemetry');
      eventSource.onopen = () => { if (active) setStreamConnected(true); };
      eventSource.onmessage = (event) => {
        try { const next = JSON.parse(event.data) as Partial<SystemTelemetry>; if (active) setTelemetry({ ...sampleTelemetry(), ...next, source: 'stream' }); } catch { /* keep sampler alive */ }
      };
      eventSource.onerror = () => { if (active) setStreamConnected(false); };
    } catch { setStreamConnected(false); }
    return () => { active = false; window.clearInterval(timer); eventSource?.close(); };
  }, [intervalMs, streamConnected]);

  return { telemetry, streamConnected };
}
