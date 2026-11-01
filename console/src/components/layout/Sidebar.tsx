import React from 'react';
import { NavLink } from 'react-router-dom';

export function Sidebar() {
  const links = [
    { to: '/', label: 'DASHBOARD', icon: '📊' },
    { to: '/world', label: 'WORLD VIEW', icon: '🌐' },
    { to: '/news', label: 'NEWS FEED', icon: '📰' },
    { to: '/social', label: 'SOCIAL HUB', icon: '💬' },
    { to: '/devices', label: 'DEVICES', icon: '📱' },
    { to: '/diagnostics', label: 'DIAGNOSTICS', icon: '🖥️' },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 w-20 bg-[#050A0E] border-r border-[#8AF8FF]24 flex flex-col py-4 px-2 text-[#D4F1F3]">
      <div className="hud-label mb-4 ml-2">AEGIS</div>
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2.5 mb-2 rounded text-xs font-bold tracking-widest uppercase transition ${isActive ? 'bg-[#8AF8FF]/10 text-[#8AF8FF] shadow-[0_0_10px_#8AF8FF]' : 'text-[#D4F1F3]/60 hover:text-[#8AF8FF] hover:bg-[#8AF8FF]/05'}`
          }
        >
          <span className="text-lg">{link.icon}</span>
          <span>{link.label}</span>
        </NavLink>
      ))}
    </aside>
  );
}
