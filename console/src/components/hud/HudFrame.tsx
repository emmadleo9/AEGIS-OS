import React from 'react';

interface HudFrameProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function HudFrame({ children, title, className = '', style }: HudFrameProps) {
  return (
    <div className={`hud-frame ${className}`} style={{ position: 'relative', ...style }}>
      {title && (
        <div className="hud-corner-title">{title}</div>
      )}
      <div className="hud-frame-tr" />
      {children}
    </div>
  );
}