import React from 'react';

interface GaugeCircleProps {
  label: string;
  value: string;
  sub: string;
  percent: number;
  size?: number;
  className?: string;
}

export function GaugeCircle({ 
  label, 
  value, 
  sub, 
  percent, 
  size = 220,
  className = '' 
}: GaugeCircleProps) {
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  
  const gaugeStyle = {
    width: size,
    height: size,
    filter: 'drop-shadow(0 0 15px rgba(138,248,255,0.8)) drop-shadow(0 0 30px rgba(138,248,255,0.25))',
  };

  return (
    <div className={`gauge-wrap ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" style={gaugeStyle}>
        {/* Background circle */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="2"
        />
        {/* Progress circle */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="#8AF8FF"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            filter: 'drop-shadow(0 0 15px rgba(138,248,255,0.8)) drop-shadow(0 0 30px rgba(138,248,255,0.25))',
            transform: 'rotate(-90deg)',
            transformOrigin: '100px 100px',
            transition: 'stroke-dashoffset 0.5s ease-out',
          }}
        />
        {/* Inner tick ring */}
        <circle
          cx="100"
          cy="100"
          r="82"
          fill="none"
          stroke="rgba(138,248,255,0.18)"
          strokeWidth="1"
          strokeDasharray="2 6"
        />
      </svg>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '20px',
      }}>
        <div className="hud-label">{label}</div>
        <div className="hud-value" style={{ fontSize: '48px', lineHeight: 1 }}>{value}</div>
        <div className="hud-label" style={{ marginTop: '4px' }}>{sub}</div>
      </div>
    </div>
  );
}