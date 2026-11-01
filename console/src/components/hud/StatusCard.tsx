interface StatusCardProps {
  label: string;
  value: string;
  sub?: string;
  status?: 'online' | 'offline' | 'warning';
  className?: string;
}

const statusColors = {
  online: 'var(--aegis-green)',
  warning: 'var(--aegis-amber)',
  offline: 'var(--aegis-red)',
};

export function StatusCard({ label, value, sub, status = 'online', className = '' }: StatusCardProps) {
  return (
    <section className={`hud-frame status-card ${className}`}>
      <div className="hud-label">{label}</div>
      <div className="status-card-value">
        <div className="hud-value">{value}</div>
        <span className="status-dot" style={{ background: statusColors[status], color: statusColors[status] }} />
      </div>
      {sub && <div className="hud-label status-card-sub">{sub}</div>}
    </section>
  );
}
