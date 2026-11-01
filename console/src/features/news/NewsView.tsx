import React from 'react';

export function NewsView() {
  return (
    <div className="p-6 min-h-screen bg-[#050A0E] text-[#D4F1F3] font-mono">
      <h1 className="text-2xl font-bold text-[#8AF8FF] tracking-widest uppercase mb-6">NEWS FEED // LIVE</h1>
      <div className="hud-frame p-6">
        <div className="hud-label mb-4">GLOBAL INTELLIGENCE STREAM</div>
        <ul className="space-y-3 text-sm text-[#D4F1F3]/80">
          <li className="flex gap-3"><span className="text-[#8AF8FF]">[+]</span> AEGIS-OS HUD v1 deployed on port 5173</li>
          <li className="flex gap-3"><span className="text-[#8AF8FF]">[+]</span> World View globe tracking live ADS-B flights</li>
          <li className="flex gap-3"><span className="text-[#8AF8FF]">[+]</span> USGS earthquake monitor active</li>
          <li className="flex gap-3"><span className="text-[#8AF8FF]">[+]</span> Gateway API on port 2785 proxied via /api</li>
          <li className="flex gap-3"><span className="text-[#8AF8FF]">[+]</span> Single frontend architecture stable</li>
        </ul>
      </div>
    </div>
  );
}
