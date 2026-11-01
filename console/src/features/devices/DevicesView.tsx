import React from 'react';

export function DevicesView() {
  const devices = [
    { id: '001', name: 'Redmi 10A', platform: 'WhatsApp', lastActive: 'Just now', status: 'Online' },
    { id: '002', name: 'iPhone 13', platform: 'WhatsApp', lastActive: '2h ago', status: 'Offline' },
    { id: '003', name: 'Samsung S22', platform: 'WhatsApp', lastActive: '5h ago', status: 'Offline' },
  ];

  return (
    <div className="p-6 min-h-screen bg-[#050A0E] text-[#D4F1F3] font-mono">
      <h1 className="text-2xl font-bold text-[#8AF8FF] tracking-widest uppercase mb-6">CONNECTED DEVICES</h1>
      <div className="hud-frame p-6 overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#8AF8FF]/30">
              <th className="hud-label pb-2">DEVICE</th>
              <th className="hud-label pb-2">PLATFORM</th>
              <th className="hud-label pb-2">LAST ACTIVE</th>
              <th className="hud-label pb-2">STATUS</th>
              <th className="hud-label pb-2">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="border-b border-[#8AF8FF]/10">
                <td className="py-3">{d.name}</td>
                <td className="py-3 text-[#8AF8FF]">{d.platform}</td>
                <td className="py-3 text-[#D4F1F3]/60">{d.lastActive}</td>
                <td className="py-3">
                  <span className={`flex items-center gap-2 ${d.status === 'Online' ? 'text-[#00FF9C]' : 'text-[#666]'}`}>
                    <span className="w-2 h-2 rounded-full bg-current animate-pulse" /> {d.status}
                  </span>
                </td>
                <td className="py-3">
                  <button className="px-2 py-1 border border-[#8AF8FF]/40 text-[#8AF8FF] text-[10px] uppercase tracking-widest hover:bg-[#8AF8FF]/10">VIEW</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
