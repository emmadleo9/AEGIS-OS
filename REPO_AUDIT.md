# Krynara-OS Repository Audit

| Repository | Path | Purpose and reusable features | APIs / data sources |
|---|---|---|---|
| KRYNARA Console | `console/` | React, Vite, TypeScript console; dashboard, MapLibre world view, weather, social settings, devices, clocks, and diagnostics | Local KRYNARA gateway at `127.0.0.1:2785`; Open-Meteo, ADS-B.lol, USGS, GDELT, and ISS feeds |
| OpenWA | `gateway/` | NestJS WhatsApp API gateway with REST/WebSocket APIs, session management, Baileys and whatsapp-web.js engines, authentication, webhooks, and dashboard. `index.js` is the separate local KRYNARA telemetry/feed adapter. | WhatsApp engines, database adapters, local telemetry, and public-feed proxies |
| OpenJarvis | `core/` | Python local-first AI framework with runtime, agent/tool orchestration, model engines, connectors, evaluations, and messaging adapters | Local/cloud model providers and configured messaging channels |
| OSIRIS reference | `_ref_map/` | Next.js/TypeScript and MapLibre intelligence dashboard; reference for map and public-feed patterns, not an KRYNARA runtime dependency | Public aviation, earthquake, weather, GDELT/conflict, satellite, news, maritime, and map data |

No additional `_ref_*` directories were present directly in the Krynara-OS workspace during this audit. The application-specific implementation and runtime caveats are documented in [HANDOVER.md](./HANDOVER.md).
