# AEGIS-OS Repository Audit

| Repository | Path | Purpose and reusable features | APIs / data sources |
|---|---|---|---|
| AEGIS Console | `console/` | React, Vite, TypeScript console; dashboard, MapLibre world view, weather, social settings, devices, clocks, and diagnostics | Local AEGIS gateway at `127.0.0.1:2785`; Open-Meteo, ADS-B.lol, USGS, GDELT, and ISS feeds |
| OpenWA | `gateway/` | NestJS WhatsApp API gateway with REST/WebSocket APIs, session management, Baileys and whatsapp-web.js engines, authentication, webhooks, and dashboard. `index.js` is the separate local AEGIS telemetry/feed adapter. | WhatsApp engines, database adapters, local telemetry, and public-feed proxies |
| OpenJarvis | `brain/` | Python local-first AI framework with runtime, agent/tool orchestration, model engines, connectors, evaluations, and messaging adapters | Local/cloud model providers and configured messaging channels |
| OSIRIS reference | `_ref_osiris/` | Next.js/TypeScript and MapLibre intelligence dashboard; reference for map and public-feed patterns, not an AEGIS runtime dependency | Public aviation, earthquake, weather, GDELT/conflict, satellite, news, maritime, and map data |
| Presentation assets | `manus-slides/` | Slides and design/architecture assets; not a runnable source repository | None |

No additional `_ref_*` directories were present directly in the AEGIS-OS workspace during this audit. The application-specific implementation and runtime caveats are documented in [HANDOVER.md](./HANDOVER.md).
