import React from 'react';

export function SocialHub() {
  const platforms = [
    { id: 'whatsapp', name: 'WhatsApp', status: 'ONLINE', color: '#25D366', icon: '💬' },
    { id: 'instagram', name: 'Instagram', status: 'COMING SOON', color: '#666', icon: '📷' },
    { id: 'discord', name: 'Discord', status: 'COMING SOON', color: '#666', icon: '🎮' },
    { id: 'telegram', name: 'Telegram', status: 'COMING SOON', color: '#666', icon: '✈️' },
  ];

  return (
    <div className="p-6 min-h-screen bg-[#050A0E] text-[#D4F1F3] font-mono">
      <h1 className="text-2xl font-bold text-[#8AF8FF] tracking-widest uppercase mb-6">SOCIAL HUB // OSINT</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {platforms.map((p) => (
          <div key={p.id} className="hud-frame p-6 flex flex-col items-center gap-4">
            <div className={`text-4xl ${p.color === '#666' ? 'opacity-40' : ''}`}>{p.icon}</div>
            <div className="hud-label">{p.name}</div>
            <div className={`text-[#00FF9C] font-bold tracking-widest ${p.status === 'ONLINE' ? 'text-[#00FF9C]' : 'text-[#666]'}`}>{p.status}</div>
            <button className="px-4 py-2 border border-[#8AF8FF]24 text-[#8AF8FF] text-xs uppercase tracking-widest hover:bg-[#8AF8FF]/10 transition">
              {p.status === 'ONLINE' ? 'CONNECT' : 'COMING SOON'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
