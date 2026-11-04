import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const gatewayPort = Number(process.env.GATEWAY_PORT || process.env.AEGIS_PORT || 2785);
const consolePort = Number(process.env.CONSOLE_PORT || 5173);
const gatewayTarget = `http://127.0.0.1:${gatewayPort}`;

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'aegis-large-upload-timeouts',
      configureServer(server) {
        if (!server.httpServer) return;
        server.httpServer.requestTimeout = 12 * 60 * 60 * 1000;
        server.httpServer.timeout = 0;
      },
      configurePreviewServer(server) {
        server.httpServer.requestTimeout = 12 * 60 * 60 * 1000;
        server.httpServer.timeout = 0;
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: consolePort,
    strictPort: true,
    proxy: {
      '/api': { target: gatewayTarget, changeOrigin: true, timeout: 0, proxyTimeout: 0 },
      '/gateway': { target: gatewayTarget, changeOrigin: true },
      '/v1': { target: gatewayTarget, changeOrigin: true },
      '/generations': { target: gatewayTarget, changeOrigin: true },
      '/ws': { target: gatewayTarget.replace('http:', 'ws:'), ws: true },
    },
  },
});
