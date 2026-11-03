import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/** three's Draco decoder, served at /draco/ in dev and copied there in a build (src/view3d/model-loader.ts). */
function dracoDecoder(): Plugin {
  const dir = join(dirname(createRequire(import.meta.url).resolve('three')), '../examples/jsm/libs/draco/gltf');
  const files = ['draco_wasm_wrapper.js', 'draco_decoder.wasm'];
  return {
    name: 'draco-decoder',
    configureServer(server) {
      server.middlewares.use('/draco', (req, res, next) => {
        const name = files.find((f) => req.url === `/${f}`);
        if (!name) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.end(readFileSync(join(dir, name)));
      });
    },
    generateBundle() {
      for (const name of files)
        this.emitFile({ type: 'asset', fileName: `draco/${name}`, source: readFileSync(join(dir, name)) });
    },
  };
}

const server = `http://localhost:${process.env.PORT ?? 3001}`;

export default defineConfig({
  plugins: [react(), tailwindcss(), dracoDecoder()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    proxy: {
      '/ws': { target: server, ws: true },
      '/api': server,
      '/mcp': server,
      '/assets': server,
      '/packs': server,
      '/plugins': server,
      '^/games/[^/]+/assets/': server,
    },
  },
});
