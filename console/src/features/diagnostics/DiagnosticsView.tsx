import React from 'react';
import { GaugeCircle, StatusCard } from '@/components/hud';

export function DiagnosticsView() {
  return (
    <div className="p-6 min-h-screen bg-[#050A0E] text-[#D4F1F3] font-mono">
      <h1 className="text-2xl font-bold text-[#8AF8FF] tracking-widest uppercase mb-6">DIAGNOSTICS // REALTIME METRICS</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatusCard label="CPU LOAD" value="42%" sub="NOMINAL" status="online" />
        <StatusCard label="MEMORY" value="78%" sub="USED" status="online" />
        <StatusCard label="UPTIME" value="12:34:56" sub="NOMINAL" status="online" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="hud-frame p-4">
          <div className="hud-label mb-2">CPU LOAD // LIVE GRAPH</div>
          <div className="h-40 flex items-end gap-1 bg-[#050A0E]/40 p-2 rounded border border-[#8AF8FF]/20">
            {[40, 55, 48, 62, 70, 58, 45, 52, 48, 40].map((v, i) => (
              <div key={i} className="w-full rounded-t bg-[#8AF8FF]" style={{ height: `${v}%` }} />
            ))}
          </div>
        </div>
        <div className="hud-frame p-4">
          <div className="hud-label mb-2">MEMORY // LIVE GRAPH</div>
          <div className="h-40 flex items-end gap-1 bg-[#050A0E]/40 p-2 rounded border border-[#8AF8FF]/20">
            {[70, 75, 72, 78, 80, 76, 74, 79, 82, 78].map((v, i) => (
              <div key={i} className="w-full rounded-t bg-[#8AF8FF]" style={{ height: `${v}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
