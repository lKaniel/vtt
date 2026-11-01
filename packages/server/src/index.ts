import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { AccountStore } from './accounts.ts';
import { apiHandler } from './api.ts';
import { CharacterStore } from './characters.ts';
import { GameHub } from './game-hub.ts';
import { httpHandler } from './http.ts';
import { dataDirFor, repoRoot, gameDirFromArgs } from './paths.ts';
import { socketSeat } from './socket-join.ts';

const PORT = Number(process.env.PORT ?? 3001);
const homeDir = gameDirFromArgs();
const clientDist = resolve(repoRoot, 'packages/client/dist');
const dataDir = dataDirFor(homeDir);

const hub = new GameHub({ dataDir, home: homeDir });
await hub.load();
const accounts = new AccountStore(dataDir);
await accounts.load();
const characters = new CharacterStore(dataDir);
await characters.load();

const assetsDir = (game?: string) => {
  const dir = hub.dirOf(game ?? hub.homeId ?? '');
  return dir && join(dir, 'assets');
};

const handleRequest = httpHandler({
  assetsDir,
  clientDir: clientDist,
  players: async () => (hub.homeId ? (await hub.info(hub.homeId)).players : []),
  api: apiHandler({ accounts, characters, hub }),
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
  void socketSeat(req, { accounts, hub }).then(
    (seat) =>
      wss.handleUpgrade(req, socket, head, (ws) => {
        if (!seat) return ws.close(4001, 'unknown player');
        try {
          hub.connect(seat.game, ws, seat.player);
        } catch {
          ws.close(4004, 'no such game');
        }
      }),
    (e: unknown) => {
      console.error('[server] could not open the game:', e);
      socket.destroy();
    },
  );
});

server.listen(PORT, () =>
  console.log(`[server] http://localhost:${PORT}: home game ${homeDir}, ${hub.ids().length} games, data in ${dataDir}`),
);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void hub.close().then(() => process.exit(0));
  });
}
