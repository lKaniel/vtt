import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { Game } from './game.ts';
import { httpHandler } from './http.ts';
import { repoRoot, worldDirFromArgs } from './paths.ts';
import { WorldStore } from './world-store.ts';

const PORT = Number(process.env.PORT ?? 3001);
const worldDir = worldDirFromArgs();
const clientDist = resolve(repoRoot, 'packages/client/dist');

const store = new WorldStore(worldDir);
await store.load();
store.watch();
const game = new Game(store);

const handleRequest = httpHandler({
  assetsDir: join(worldDir, 'assets'),
  clientDir: clientDist,
  players: () => store.world.players,
});

const server = createServer((req, res) => {
  handleRequest(req, res).catch((e: unknown) => {
    console.error('[server] request failed:', e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/ws') return socket.destroy();
  const player = game.findPlayer(url.searchParams.get('player') ?? '');
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (!player) return ws.close(4001, 'unknown player');
    game.connect(ws, player);
  });
});

server.listen(PORT, () => console.log(`[server] http://localhost:${PORT} serving world ${worldDir}`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    store.close();
    void store.flush().then(() => process.exit(0));
  });
}
