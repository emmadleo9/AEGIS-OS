import React from 'react';

interface StatusCardProps {
  label: string;
  value: string;
  sub?: string;
  status?: 'online' | 'offline' | 'warning';
  className?: string;
}

export function StatusCard({ label, value, sub, status = 'online', className = '' }: StatusCardProps) {
  return (
    <div className={`hud-frame ${className}`} style={{ 
      borderLeft: '2px solid var(--cyan)',
      padding: '16px 20px',
      margin: '8px 12px',
      minWidth: '280px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    }}>
      <div className="hud-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div className="hud-value" style={{ fontSize: '22px', fontWeight: '500' }}>{value}</div>
        <div className="status-dot" style={{ 
          background: status === 'online' ? 'var(--green-dot)' : status === 'warning' ? '#FFA500' : '#FF4444',
          boxShadow: status === 'online' ? '0 0 8px var(--green-dot)' : status === 'warning' ? '0 0 8px #FFA500' : '0 0 8px #FF4444',
        }} />
      </div>
      {sub && <div className="hud-label" style={{ marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}