import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const server = `http://localhost:${process.env.PORT ?? 3001}`;

export default defineConfig({
  plugins: [react()],
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
