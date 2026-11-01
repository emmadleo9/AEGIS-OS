import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { HudFrame } from './components/hud';
import { Dashboard } from './features/dashboard/Dashboard';
import { DevicesView } from './features/devices/DevicesView';
import { DiagnosticsView } from './features/diagnostics/DiagnosticsView';
import { SocialHub } from './features/social/SocialHub';
import { TimeView } from './features/time/TimeView';
import { WeatherView } from './features/weather/WeatherView';
import { WorldView } from './features/world/WorldView';

const links = [
  ['/', '◈', 'DASHBOARD'],
  ['/world', '◎', 'WORLD VIEW'],
  ['/weather', '☼', 'WEATHER INTEL'],
  ['/feeds', '▤', 'NEWS & CONFLICT'],
  ['/social', '◌', 'SOCIAL HUB'],
  ['/scopes', '⌁', 'SCOPES & RADARS'],
  ['/devices', '▣', 'MY DEVICES'],
  ['/time', '◷', 'WORLD CLOCK'],
  ['/diagnostics', '⌘', 'DIAGNOSTICS'],
];

function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [now, setNow] = useState(() => new Date());
  const titles: Record<string, string> = {
    '/': 'COMMAND DASHBOARD',
    '/world': 'WORLD VIEW',
    '/weather': 'WEATHER INTEL',
    '/feeds': 'NEWS & CONFLICT FEED',
    '/social': 'SOCIAL HUB',
    '/scopes': 'SCOPES & RADARS',
    '/devices': 'MY DEVICES',
    '/time': 'WORLD CLOCK & TIME INTEL',
    '/diagnostics': 'SYSTEM DIAGNOSTICS',
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="aegis-app">
      <aside className="aegis-sidebar">
        <div className="aegis-brand">
          AEGIS
          <small>PUBLIC DATA CONSOLE // 03.2</small>
        </div>
        <nav className="aegis-nav" aria-label="Main navigation">
          {links.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <span className="aegis-nav-icon" aria-hidden="true">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-status">
          <div className="hud-label">SYSTEM STATE</div>
          <div className="sidebar-status-value"><span className="status-dot" /> NOMINAL</div>
        </div>
      </aside>
      <main className="aegis-main">
        <header className="aegis-topline">
          <div>
            <div className="aegis-kicker">SYSTEM MONITOR v3.2 // AEGIS-OS ONLINE</div>
            <h1 className="aegis-heading">{titles[pathname] ?? 'AEGIS CONSOLE'}</h1>
          </div>
          <div className="aegis-clock">
            LOCAL NODE // ACTIVE
            <br />
            <span>{now.toISOString().replace('T', ' ').slice(0, 19)}Z</span>
          </div>
        </header>
        <div key={pathname} className="aegis-page">{children}</div>
      </main>
    </div>
  );
}

function FeedsView() {
  const [events, setEvents] = useState<Array<{ title: string; date: string; url?: string }>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('https://api.gdeltproject.org/api/v2/geo/geo?query=conflict&mode=pointdata&format=geojson&timespan=24h&maxpoints=100');
        if (!response.ok) throw new Error(`GDELT returned HTTP ${response.status}`);
        const result = await response.json() as { features?: Array<{ properties?: { name?: string; date?: string; url?: string } }> };
        if (active) {
          setEvents((result.features ?? []).slice(0, 30).map(({ properties }) => ({
            title: properties?.name ?? 'Unlabeled public event',
            date: properties?.date ?? '',
            url: properties?.url,
          })));
          setError('');
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return (
    <HudFrame title="GDELT // PUBLIC EVENTS">
      <div className="feed-list">
        {events.map((event, index) => (
          <a className="aegis-row feed-row" href={event.url || 'https://www.gdeltproject.org/'} target="_blank" rel="noreferrer" key={`${event.title}-${index}`}>
            <strong>{event.title}</strong><span>{event.date}</span>
          </a>
        ))}
        {events.length === 0 && <p className="inline-status">{error ? `Feed unavailable: ${error}` : 'Loading public event feed…'}</p>}
      </div>
    </HudFrame>
  );
}

function ScopesView() {
  return (
    <div className="aegis-grid aegis-grid-3">
      <HudFrame title="AVIATION SCOPE"><p className="scope-copy">Public ADS-B aircraft reports are refreshed every 15 seconds in World View.</p><NavLink className="hud-link" to="/world">OPEN LIVE MAP →</NavLink></HudFrame>
      <HudFrame title="SEISMIC SCOPE"><p className="scope-copy">USGS all-day earthquake reports are refreshed every 60 seconds.</p><NavLink className="hud-link" to="/world">OPEN LIVE MAP →</NavLink></HudFrame>
      <HudFrame title="WEATHER SCOPE"><p className="scope-copy">Open-Meteo current conditions and forecasts update once per minute.</p><NavLink className="hud-link" to="/weather">OPEN WEATHER →</NavLink></HudFrame>
    </div>
  );
}

function NotFound() {
  return <HudFrame title="ROUTE ERROR"><div className="hud-value not-found-title">INVALID URL</div><NavLink className="hud-link" to="/">RETURN TO DASHBOARD →</NavLink></HudFrame>;
}

export default function AegisApp() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/world" element={<WorldView />} />
          <Route path="/weather" element={<WeatherView />} />
          <Route path="/feeds" element={<FeedsView />} />
          <Route path="/social" element={<SocialHub />} />
          <Route path="/scopes" element={<ScopesView />} />
          <Route path="/devices" element={<DevicesView />} />
          <Route path="/time" element={<TimeView />} />
          <Route path="/diagnostics" element={<DiagnosticsView />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
