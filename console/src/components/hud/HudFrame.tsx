import React from 'react';

interface HudFrameProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export function HudFrame({ children, title, className = '' }: HudFrameProps) {
  return (
    <div className={`hud-frame ${className}`} style={{ position: 'relative' }}>
      {title && (
        <div className="hud-corner-title">{title}</div>
      )}
      <div className="hud-frame-tr" />
      {children}
    </div>
  );
}