import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { Game } from './game.ts';
import { repoRoot, worldDirFromArgs } from './paths.ts';
import { WorldStore } from './world-store.ts';

const PORT = Number(process.env.PORT ?? 3001);
const worldDir = worldDirFromArgs();
const clientDist = resolve(repoRoot, 'packages/client/dist');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Streams a file from inside `root`, refusing paths that escape it. */
async function serveFile(res: ServerResponse, root: string, urlPath: string): Promise<boolean> {
  const path = normalize(join(root, decodeURIComponent(urlPath)));
  if (path !== root && !path.startsWith(root + sep)) return false;
  try {
    if (!(await stat(path)).isFile()) return false;
  } catch {
    return false;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
  return true;
}

const store = new WorldStore(worldDir);
await store.load();
store.watch();
const game = new Game(store);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/players') {
    // Self-hosted for friends: anyone who can reach the server may pick a seat.
    const players = store.world.players.map(({ id, name, role, color }) => ({ id, name, role, color }));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(players));
    return;
  }
  if (url.pathname.startsWith('/assets/') && (await serveFile(res, join(worldDir, 'assets'), url.pathname.slice(8)))) return;
  if (await serveFile(res, clientDist, url.pathname)) return;
  if (await serveFile(res, clientDist, 'index.html')) return;
  res.writeHead(404).end('Not found. In development, open the Vite dev server instead.');
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
  process.on(sig, async () => {
    store.close();
    await store.flush();
    process.exit(0);
  });
}
