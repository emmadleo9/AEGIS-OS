# _refs/ - Vendored Open-Source References

This folder contains vendored copies of upstream open-source repos forked under emmadleo9.

They are vendored here so we can **COPY + EDIT** instead of **GENERATE** from scratch — saving ~80% of token usage on future work.

When building World Map, Globe, Satellite, WhatsApp, Chat UI, or Voice features:
1. Read the file from `_refs/_ref_*-full/src/`
2. Copy it into the correct `console/src/` location
3. Edit CSS colors to match the AEGIS cyan HUD theme
4. Paste into `console/src/`

Do NOT generate these from zero ever again.

## Contents:

| Folder | Upstream | License | Used For |
|--------|----------|---------|----------|
| `_ref_jarvis-full/` | OpenJarvis | Apache 2.0 | Core engine |
| `_ref_map-full/` | osiris | MIT | World View globe, OSINT feeds |
| `_ref_openwa-full/` | OpenWA | MIT | WhatsApp/comms engine |
| `_ref_bspui-full/` | open-bsp-ui | The Unlicense | UI component kit |

Each folder includes its original LICENSE file. See CREDITS.md for full acknowledgements.
