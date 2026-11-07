# KRYNARA HUD Design System

**SINGLE SOURCE OF TRUTH** for all Krynara-OS frontends and future gateways.

## Usage

```tsx
import '@/styles/krynara-hud.css';
import { HudFrame, GaugeCircle, StatusCard } from '@/components/hud';
```

## Rules

1. **ALL future gateways MUST import `@/styles/krynara-hud.css`**
2. **Use only these components**: `HudFrame`, `GaugeCircle`, `StatusCard`
3. **No custom CSS allowed** - this is the single source of truth
4. **Feature folders**: `src/features/[gateway]/components`
5. **Shared UI only in**: `src/components/ui` + `src/components/hud`

## Design Tokens

```css
--bg: #050A0E;
--bg-panel: rgba(8,24,30,0.88);
--cyan: #8AF8FF;
--cyan-border: rgba(138,248,255,0.35);
--cyan-glow: 0 0 15px rgba(138,248,255,0.8), 0 0 30px rgba(138,248,255,0.25);
--text: #D4F1F3;
--text-dim: rgba(212,241,243,0.5);
--green-dot: #00FF9C;
```

## Fonts

- **Share Tech Mono** - Labels, UI text
- **JetBrains Mono** - Monospace, code, data
- **Rajdhani** - Large values, headings

## Components

- `HudFrame` - Container with corner brackets and optional title
- `GaugeCircle` - SVG circular progress with glow
- `StatusCard` - Compact status display with dot indicator

**NO OTHER CSS ALLOWED.** This file is the single source of truth for all Krynara-OS gateways.
