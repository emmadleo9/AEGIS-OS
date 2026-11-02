import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { host: true, port: 5173, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:2785', changeOrigin: true }, '/generations': { target: 'http://127.0.0.1:2785', changeOrigin: true }, '/ws': { target: 'ws://127.0.0.1:2785', ws: true } } },
});
