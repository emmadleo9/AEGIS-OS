import { useEffect, useRef, useState } from 'react';

type GaugeCircleProps = { label: string; value: string; sub: string; percent: number; size?: number };

function numericValue(value: string) {
  const match = /^(-?\d+(?:\.\d+)?)(.*)$/.exec(value);
  return match ? { number: Number(match[1]), suffix: match[2] } : null;
}

export function GaugeCircle({ label, value, sub, percent, size = 180 }: GaugeCircleProps) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const safe = Math.max(0, Math.min(100, percent));
  const [displayValue, setDisplayValue] = useState(value);
  const currentValue = useRef(value);

  useEffect(() => {
    const from = numericValue(currentValue.current);
    const to = numericValue(value);
    currentValue.current = value;
    if (!from || !to || from.suffix !== to.suffix) {
      setDisplayValue(value);
      return;
    }

    let frame = 0;
    const started = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - started) / 1200);
      const eased = 1 - (1 - progress) ** 3;
      const next = from.number + (to.number - from.number) * eased;
      const digits = Number.isInteger(to.number) ? 0 : 1;
      setDisplayValue(`${next.toFixed(digits)}${to.suffix}`);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <div className="gauge-circle" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-label={`${label}: ${displayValue}`}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(138,248,255,.12)" strokeWidth="2" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--aegis-cyan)"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - safe / 100)}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1)' }}
        />
        <circle cx="50" cy="50" r="35" fill="none" stroke="rgba(138,248,255,.2)" strokeWidth=".7" strokeDasharray="1.5 4" />
      </svg>
      <div className="gauge-circle__content">
        <div className="hud-label">{label}</div>
        <div className="hud-value gauge-value">{displayValue}</div>
        <div className="hud-label">{sub}</div>
      </div>
    </div>
  );
}
