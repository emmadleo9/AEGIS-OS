<h1 align="center">AEGIS Console</h1>
<p align="center">
  <strong>Dark OLED console for WhatsApp, Instagram, Telegram, Discord</strong>
</p>
<p align="center">
  <a href="https://unlicense.org/"><img src="https://img.shields.io/badge/license-Unlicense-blue.svg" alt="License: Unlicense"></a>&nbsp;
  <img src="https://img.shields.io/badge/AEGIS-OS-black.svg" alt="AEGIS-OS"/>
  <img src="https://img.shields.io/badge/vite-react-tailwind-blue.svg" alt="Stack"/>
</p>

## AEGIS Console (Face / Console)

The AEGIS Console is the user-facing interface of AEGIS-OS. Rebranded from open-bsp-ui to a pure black OLED (#000000) design with glassmorphism cards, an obsidian glass shield logo, and a network-core animation. No light mode.

### Design

- **Background:** Pure black `#000000` (OLED)
- **Cards:** Glassmorphism with `backdrop-filter: blur`, semi-transparent white borders
- **Accent:** Neon green `#00ff88`
- **Logo:** Obsidian glass shield
- **Animation:** Network core pulse ring

### Configuration

The console connects to the AEGIS gateway and brain via environment variables:

```env
VITE_GATEWAY_URL=http://gateway:2785
VITE_BRAIN_URL=http://brain:8000
VITE_APP_NAME=AEGIS
VITE_API_MASTER_KEY=aegis_master_key
```

### Run

```bash
cd console
npm install
npm run dev   # http://localhost:5173
npm run build # Vite build to dist/
```

The console is also served by nginx in Docker on port 3000, proxying `/api/` to the gateway and `/brain/` to the brain.
