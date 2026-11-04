# AEGIS-OS Console rebuild

## Design
The supplied SYSTEM MONITOR v3.2 HUD reference is the source of truth: a dark, cyan-glowing tactical monitor with Share Tech Mono typography, bracketed panels, circular gauges, and compact telemetry. The layout uses a persistent navigation rail plus dense operational panels rather than decorative imagery. Motion is restrained to status pulses and gauge transitions. The legal OSINT World view is the only map surface and uses public flight and earthquake feeds.

## Implementation
- Replace the old generated route entry with a BrowserRouter shell in `src/App.tsx`.
- Keep reusable HUD primitives in `src/components/hud` and use a single theme stylesheet.
- Use MapLibre globe projection with Carto dark style, public ADS-B aircraft data capped at 300, and USGS all-day earthquake GeoJSON.
- Expose the six requested app routes and a deliberate invalid-URL fallback only.
- Preserve the Vite proxy for `/api` to localhost:2785.

## Project structure
`src/App.tsx` owns layout, navigation, and page route composition; `src/components/hud` owns visual primitives; `src/features/world` owns map rendering and public-data hooks; `public/routes.json` declares valid routes.
