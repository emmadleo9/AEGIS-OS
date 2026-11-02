import { useEffect, useMemo, useRef, useState } from 'react';
import { HudFrame } from '@/components/hud';

const cities = [
  { name: 'BAKER ISLAND', zone: 'Etc/GMT+12' },
  { name: 'AMERICAN SAMOA', zone: 'Pacific/Pago_Pago' },
  { name: 'HAWAII', zone: 'Pacific/Honolulu' },
  { name: 'MARQUESAS', zone: 'Pacific/Marquesas' },
  { name: 'ALASKA', zone: 'America/Anchorage' },
  { name: 'LOS ANGELES', zone: 'America/Los_Angeles' },
  { name: 'DENVER', zone: 'America/Denver' },
  { name: 'CHICAGO', zone: 'America/Chicago' },
  { name: 'NEW YORK', zone: 'America/New_York' },
  { name: 'CARACAS', zone: 'America/Caracas' },
  { name: 'HALIFAX', zone: 'America/Halifax' },
  { name: 'NEWFOUNDLAND', zone: 'America/St_Johns' },
  { name: 'BUENOS AIRES', zone: 'America/Argentina/Buenos_Aires' },
  { name: 'SOUTH GEORGIA', zone: 'Atlantic/South_Georgia' },
  { name: 'AZORES', zone: 'Atlantic/Azores' },
  { name: 'LONDON', zone: 'Europe/London' },
  { name: 'BERLIN', zone: 'Europe/Berlin' },
  { name: 'CAIRO', zone: 'Africa/Cairo' },
  { name: 'MOSCOW', zone: 'Europe/Moscow' },
  { name: 'TEHRAN', zone: 'Asia/Tehran' },
  { name: 'DUBAI', zone: 'Asia/Dubai' },
  { name: 'KABUL', zone: 'Asia/Kabul' },
  { name: 'KARACHI', zone: 'Asia/Karachi' },
  { name: 'KOLKATA', zone: 'Asia/Kolkata' },
  { name: 'KATHMANDU', zone: 'Asia/Kathmandu' },
  { name: 'DHAKA', zone: 'Asia/Dhaka' },
  { name: 'YANGON', zone: 'Asia/Yangon' },
  { name: 'BANGKOK', zone: 'Asia/Bangkok' },
  { name: 'SINGAPORE', zone: 'Asia/Singapore' },
  { name: 'EUCLA', zone: 'Australia/Eucla' },
  { name: 'TOKYO', zone: 'Asia/Tokyo' },
  { name: 'ADELAIDE', zone: 'Australia/Adelaide' },
  { name: 'SYDNEY', zone: 'Australia/Sydney' },
  { name: 'LORD HOWE', zone: 'Australia/Lord_Howe' },
  { name: 'SOLOMON ISLANDS', zone: 'Pacific/Guadalcanal' },
  { name: 'NORFOLK ISLAND', zone: 'Pacific/Norfolk' },
  { name: 'AUCKLAND', zone: 'Pacific/Auckland' },
  { name: 'CHATHAM ISLANDS', zone: 'Pacific/Chatham' },
  { name: 'KIRITIMATI', zone: 'Pacific/Kiritimati' },
];

function getClockParts(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return {
    hours: Number(parts.find((part) => part.type === 'hour')?.value ?? 0),
    minutes: Number(parts.find((part) => part.type === 'minute')?.value ?? 0),
    seconds: Number(parts.find((part) => part.type === 'second')?.value ?? 0),
  };
}

function getUtcOffset(date: Date, zone: string) {
  return new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value.replace('GMT', 'UTC') ?? 'UTC';
}

function AnalogClock({ now, zone, size = 60 }: { now: Date; zone: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, size);
    context.translate(size / 2, size / 2);
    context.strokeStyle = '#8AF8FF';
    context.fillStyle = '#8AF8FF';
    context.shadowColor = '#8AF8FF';
    context.shadowBlur = 5;
    context.lineWidth = 1;
    const radius = size / 2 - 3;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
    context.shadowBlur = 0;
    const tickLength = size > 70 ? 4 : 3;
    for (let tick = 0; tick < 12; tick += 1) {
      const angle = (tick / 12) * Math.PI * 2 - Math.PI / 2;
      context.beginPath();
      context.moveTo(Math.cos(angle) * (radius - tickLength - 1), Math.sin(angle) * (radius - tickLength - 1));
      context.lineTo(Math.cos(angle) * (radius - 1), Math.sin(angle) * (radius - 1));
      context.stroke();
    }

    const { hours: hour, minutes: minute, seconds } = getClockParts(now, zone);
    const hours = (hour % 12) + minute / 60;
    const hand = (angle: number, length: number, width: number) => {
      context.beginPath();
      context.lineWidth = width;
      context.lineCap = 'round';
      context.moveTo(0, 2);
      context.lineTo(Math.sin(angle) * length, -Math.cos(angle) * length);
      context.stroke();
    };
    hand((hours / 12) * Math.PI * 2, radius * 0.52, 2);
    hand((minute / 60) * Math.PI * 2, radius * 0.72, 1.4);
    hand((seconds / 60) * Math.PI * 2, radius * 0.82, 0.8);
    context.beginPath();
    context.arc(0, 0, 1.8, 0, Math.PI * 2);
    context.fill();
  }, [now, size, zone]);

  return <canvas ref={canvasRef} className="analog-clock" width={size} height={size} aria-hidden="true" />;
}

export function TimeView() {
  const [now, setNow] = useState(() => new Date());
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState('ALL');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const offsets = useMemo(() => [...new Set(cities.map((city) => getUtcOffset(now, city.zone)))].sort(), [now]);
  const visibleCities = useMemo(() => cities.filter((city) => {
    const matchesQuery = city.name.toLowerCase().includes(query.trim().toLowerCase()) || city.zone.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (offset === 'ALL' || getUtcOffset(now, city.zone) === offset);
  }), [now, offset, query]);

  return (
    <div className="time-page">
      <div className="time-local">
        <HudFrame title="LOCAL NODE // LIVE">
          <div className="time-local-content">
            <AnalogClock now={now} zone={Intl.DateTimeFormat().resolvedOptions().timeZone} size={80} />
            <div>
              <div className="hud-label">LOCAL SYSTEM TIME</div>
              <div className="time-local-digital">
                {new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now)}
              </div>
              <div className="hud-label">{new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(now)}</div>
            </div>
          </div>
        </HudFrame>
      </div>
      <div className="time-controls">
        <label>
          <span className="hud-label">SEARCH CITY OR ZONE</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Tokyo or Pacific" />
        </label>
        <label>
          <span className="hud-label">UTC OFFSET</span>
          <select value={offset} onChange={(event) => setOffset(event.target.value)}>
            <option value="ALL">ALL OFFSETS</option>
            {offsets.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <span className="time-result-count">{visibleCities.length} OF {cities.length} LOCATIONS</span>
      </div>
      <div className="time-city-grid">
        {visibleCities.map((city) => (
          <HudFrame key={city.zone} title={getUtcOffset(now, city.zone)} className="time-city-card">
            <AnalogClock now={now} zone={city.zone} />
            <div className="time-city-info">
              <div className="hud-label">{city.name}</div>
              <time className="time-city-digital" dateTime={now.toISOString()}>
                {new Intl.DateTimeFormat('en-GB', { timeZone: city.zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now)}
              </time>
              <div className="time-city-date">
                {new Intl.DateTimeFormat('en-GB', { timeZone: city.zone, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(now)}
              </div>
            </div>
          </HudFrame>
        ))}
        {visibleCities.length === 0 && <p className="inline-status">NO MATCHING TIME ZONES</p>}
      </div>
    </div>
  );
}
