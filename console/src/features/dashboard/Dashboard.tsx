import React from 'react';
import { GaugeCircle, StatusCard } from '@/components/hud';

export function Dashboard() {
  return (
    <div className="p-6 min-h-screen bg-[#050A0E] text-[#D4F1F3] font-mono">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-[#8AF8FF] tracking-widest uppercase">AEGIS-OS // CONSOLE ONLINE</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatusCard label="SYSTEM" value="ONLINE" sub="NOMINAL" status="online" />
          <StatusCard label="ENTITIES" value="1240" sub="TRACKED" status="online" />
          <StatusCard label="API LATENCY" value="42ms" sub="NOMINAL" status="online" />
          <StatusCard label="FPS" value="60" sub="STABLE" status="online" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="hud-frame p-4">
            <GaugeCircle label="CPU LOAD" value="42%" sub="3.4GHz" percent={42} size={200} />
          </div>
          <div className="hud-frame p-4">
            <GaugeCircle label="MEMORY" value="6.2/8GB" sub="78%" percent={78} size={200} />
          </div>
          <div className="hud-frame p-4">
            <GaugeCircle label="GPU" value="64%" sub="TEMP 58C VRAM 2.0/4.0GB" percent={64} size={200} />
          </div>
        </div>
      </div>
    </div>
  );
}
