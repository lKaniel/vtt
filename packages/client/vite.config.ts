import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const server = `http://localhost:${process.env.PORT ?? 3001}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    proxy: {
      '/ws': { target: server, ws: true },
      '/api': server,
      '/assets': server,
      '/packs': server,
      '^/games/[^/]+/assets/': server,
    },
  },
});
