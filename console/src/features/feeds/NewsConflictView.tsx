import { useEffect, useMemo, useRef, useState } from 'react';
import { HudFrame } from '@/components/hud';
import { loadMemory, saveMemory, pushSearchHistory } from '@/lib/aegis-memory';

type Article = { title: string; url: string; domain?: string; sourceCountry?: string; date?: string };
type FeedEvent = { title: string; date: string; url?: string; name?: string; lon?: number; lat?: number; articles?: number };

const COUNTRIES = [
  'Pakistan', 'India', 'United States', 'United Kingdom', 'China', 'Russia', 'Ukraine', 'Israel', 'Palestine',
  'Iran', 'Iraq', 'Syria', 'Afghanistan', 'Turkey', 'Egypt', 'Saudi Arabia', 'United Arab Emirates', 'Qatar',
  'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Brazil', 'Argentina', 'Mexico', 'Canada', 'Australia',
  'Japan', 'South Korea', 'Indonesia', 'Malaysia', 'Bangladesh', 'Nigeria', 'South Africa', 'Ethiopia', 'Kenya',
];

const COUNTRY_CENTER: Record<string, [number, number]> = {
  Pakistan: [69.3, 30.4], India: [78.9, 20.6], 'United States': [-98, 39.8], 'United Kingdom': [-1.5, 52.4],
  China: [104, 35.9], Russia: [95, 61.5], Ukraine: [31.2, 48.4], Israel: [34.9, 31], Palestine: [35.2, 31.9],
  Iran: [53.7, 32.4], Iraq: [43.8, 33.2], Syria: [38.3, 34.8], Afghanistan: [66, 33.9], Turkey: [35.2, 39],
  Egypt: [30.8, 26.8], 'Saudi Arabia': [45.1, 23.9], Brazil: [-52, -10.8], Japan: [138.2, 36.2],
  Germany: [10.4, 51.2], France: [2.5, 46.6], Nigeria: [8.1, 9.1], 'South Africa': [24.7, -28.5],
};

function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function useMiniMap(query: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const maplibreRef = useRef<typeof import('maplibre-gl') | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const maplibre = await import('maplibre-gl');
      if (cancelled || !containerRef.current || mapRef.current) return;
      maplibreRef.current = maplibre;
      mapRef.current = new maplibre.Map({
        container: containerRef.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [0, 20],
        zoom: 1,
        attributionControl: false,
      });
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const center = COUNTRY_CENTER[query];
    if (!center || !mapRef.current || !maplibreRef.current) return;
    mapRef.current.flyTo({ center, zoom: 3.2, duration: 1600, essential: true });
  }, [query]);

  return containerRef;
}

export function NewsConflictView() {
  const [query, setQuery] = useState('');
  const [showRecs, setShowRecs] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [selected, setSelected] = useState<Article | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const debouncedQuery = useDebounced(query, 300);
  const miniMapRef = useMiniMap(debouncedQuery);

  useEffect(() => { void loadMemory<string[]>('searchHistory', []).then(setHistory); }, []);

  // Global feed (preserve original behaviour)
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch('/api/feeds/gdelt', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json() as { features?: Array<{ geometry?: { coordinates?: number[] }; properties?: { name?: string; url?: string; articles?: number } }> };
        if (alive) {
          setEvents((result.features ?? []).slice(0, 30).map((feature) => ({
            title: feature.properties?.name ?? 'Unlabeled event',
            name: feature.properties?.name,
            url: feature.properties?.url,
            articles: feature.properties?.articles,
            lon: feature.geometry?.coordinates?.[0],
            lat: feature.geometry?.coordinates?.[1],
            date: feature.properties?.articles ? `${feature.properties.articles} REPORTS` : '',
          })));
        }
      } catch (reason) {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void load();
    const timer = window.setInterval(load, 5 * 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const recommendations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const source = [...new Set([...COUNTRIES, ...history])];
    return source.filter((item) => item.toLowerCase().includes(q)).slice(0, 8);
  }, [query, history]);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) { setArticles([]); setError(''); return; }
    let alive = true;
    void (async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/gdelt/search?q=${encodeURIComponent(q)}`);
        if (!response.ok) throw new Error(`Search failed (HTTP ${response.status})`);
        const data = await response.json() as { articles?: Article[] };
        if (alive) {
          setArticles(data.articles ?? []);
          setError('');
          setHistory((current) => {
            const next = [q, ...current.filter((item) => item !== q)].slice(0, 30);
            void saveMemory('searchHistory', next);
            return next;
          });
          void pushSearchHistory(q);
        }
      } catch (reason) {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (alive) setSearching(false);
      }
    })();
    return () => { alive = false; };
  }, [debouncedQuery]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <HudFrame title="NEWS & CONFLICT // SEARCH">
        <div className="feed-search-bar">
          <span className="feed-search-icon" aria-hidden="true">⌕</span>
          <input
            aria-label="Search country or conflict"
            placeholder="Search country or conflict…"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setShowRecs(true); }}
            onFocus={() => setShowRecs(true)}
            onBlur={() => window.setTimeout(() => setShowRecs(false), 150)}
          />
          {showRecs && (recommendations.length > 0 || history.length > 0) && (
            <div className="feed-search-recs">
              {recommendations.length > 0 && <button type="button" className="rec-header" tabIndex={-1}>SUGGESTIONS</button>}
              {recommendations.map((item) => (
                <button type="button" key={item} onMouseDown={() => { setQuery(item); setShowRecs(false); }}>{item}</button>
              ))}
              {!query && history.length > 0 && <button type="button" className="rec-header" tabIndex={-1}>RECENT</button>}
              {!query && history.slice(0, 6).map((item) => (
                <button type="button" key={`h-${item}`} onMouseDown={() => setQuery(item)}>{item}</button>
              ))}
            </div>
          )}
        </div>
        {searching && <p className="inline-status">Querying GDELT DOC 2.0…</p>}
        {error && <p className="inline-status" style={{ color: '#ff8792' }}>{error}</p>}
      </HudFrame>

      <div className="feeds-layout">
        <HudFrame title={debouncedQuery.trim().length >= 2 ? `RESULTS // "${debouncedQuery.trim().toUpperCase()}"` : 'GDELT // GLOBAL EVENTS'}>
          <div className="feed-list">
            {(debouncedQuery.trim().length >= 2 ? articles.map((article) => ({ title: article.title, date: article.date, url: article.url })) : events).map((item, index) => (
              <a
                className="aegis-row feed-row"
                href={item.url || 'https://www.gdeltproject.org/'}
                target="_blank"
                rel="noreferrer"
                key={`${item.title}-${index}`}
                onMouseDown={() => item.url && setSelected({ title: item.title, url: item.url })}
              >
                <strong>{item.title}</strong><span>{item.date}</span>
              </a>
            ))}
            {debouncedQuery.trim().length >= 2 && articles.length === 0 && !searching && (
              <p className="inline-status">No GDELT articles matched this query.</p>
            )}
          </div>
        </HudFrame>

        <div style={{ display: 'grid', gap: 16 }}>
          <HudFrame title="EVENT DETAIL">
            {selected
              ? <div style={{ display: 'grid', gap: 10 }}>
                <strong style={{ color: 'var(--aegis-cyan)' }}>{selected.title}</strong>
                <a className="hud-link" href={selected.url} target="_blank" rel="noreferrer">OPEN SOURCE ARTICLE →</a>
              </div>
              : <p className="inline-status">Select an event card to inspect it here.</p>}
          </HudFrame>
          <HudFrame title="REGION MAP">
            <div className="weather-map-container" style={{ minHeight: 260 }}>
              <div ref={miniMapRef} className="weather-mini-map" />
            </div>
            <p className="credential-notice">Map flies to the searched country (type a country name and press enter / pick a suggestion).</p>
          </HudFrame>
        </div>
      </div>
    </div>
  );
}
