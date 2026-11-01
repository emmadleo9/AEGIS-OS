# AEGIS-OS console outcomes

- [x] Create `src/styles/aegis-hud.css` with `#050A0E`, `#8AF8FF`, 15px glow, Share Tech Mono, 22px HUD corner brackets, gauge circles, and pulsing status dots.
- [x] Create HUD frame and gauge components and rebuild `src/App.tsx` with BrowserRouter, Sidebar, main area, and routes `/`, `/world`, `/news`, `/social`, `/devices`, `/diagnostics`.
- [x] Dashboard contains four status cards and three gauge circles; the remaining legal-data pages contain functional HUD layouts.
- [x] World view uses a MapLibre GL globe with Carto dark style, ADS-B legal public flight data capped at 300, USGS all-day quake GeoJSON, and HUD counts.
- [x] Vite serves on port 5173 with host enabled and proxies `/api` to `http://localhost:2785`.
- [x] Verify `/` and `/world` build and respond without a Not Found page; only invalid URLs use the fallback.
