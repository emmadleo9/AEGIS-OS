# AEGIS-OS workspace handover

## Repository inventory

| Directory | Project | What is present |
|---|---|---|
| `console/` | OpenBSP UI with AEGIS console work | A Vite/React/TypeScript single-page app. The original source includes WhatsApp/Instagram conversations, organization and contact management, templates, integrations, stats, and settings. The AEGIS additions provide a separate HUD app shell and public-data pages. |
| `gateway/` | OpenWA | A NestJS/TypeScript WhatsApp API gateway with REST and WebSocket APIs, a React dashboard, multi-session support, Baileys and whatsapp-web.js engines, scoped API keys, webhooks, plugins, and database/storage adapters. It is not a minimal Express server. `gateway/index.js` is an additive local AEGIS telemetry adapter; the existing OpenWA entry point and package scripts remain unchanged. |
| `brain/` | OpenJarvis | A Python local-first AI framework. Its source includes CLI/runtime services, local and cloud model engines, agent/tool orchestration, connectors, evaluations, and messaging channel adapters including WhatsApp, Telegram, and Discord. |
| `_ref_osiris/` | OSIRIS reference | A Next.js/TypeScript and MapLibre intelligence dashboard. Its API routes and source cover public aircraft, earthquake, weather, GDELT/conflict, satellite, news, maritime, and map data, alongside additional OSINT tools. It is reference material, not part of the AEGIS runtime. |

`manus-slides/` contains design and architecture presentation assets, rather than a runnable source repository. No other top-level cloned repositories were present during this audit.

## Runtime notes

- The console uses Vite on port `5173` and proxies `/api` to the AEGIS local gateway on `2785`.
- Use `MASTER START AEGIS-OS V.04.bat` on Windows or `npm run start` to start the coordinated local stack. The launcher starts/reuses Ollama when available, waits for gateway health before starting the console, and rejects duplicate or conflicting startup.
- Global ADS-B coverage is attempted first; because the upstream global endpoint currently returns HTTP 400, the adapter falls back to rate-paced regional ADS-B requests capped at 400 aircraft. GDELT conflict events are read from the 15-minute GDELT 2.0 Events export and cached for five minutes.
- The active `gateway/index.js` hosts AEGIS's local API, World View feed proxies, local AI routes, and AEGIS WhatsApp service. The separate Docker Compose topology is an alternative deployment and must not run alongside the local launcher because it publishes overlapping service ports.
- Public intelligence feeds can be unavailable or rate-limited independently; the map and shell must continue rendering without them.
- Social connection tests use credentials configured by the operator and contact official platform APIs directly. The conversation list and messages are local demo content, not live message ingestion.
- Weather forecasts and city suggestions are served through `/api/weather` and `/api/geocode`; the gateway validates coordinates and keeps upstream requests out of browser CORS paths.
- World Clock includes all 39 locations named in the current request (the supplied list contains 39, despite its “38” label), with live IANA timezone offsets, search, and offset filtering.
- Launcher-owned process IDs and the singleton startup lock are tracked under the user's local application data. `STOP-AEGIS.bat` only stops processes started by the launcher.
- The MapLibre worker is explicitly served as a Vite asset, and the world map container has a fixed responsive height so it renders instead of collapsing to zero.
