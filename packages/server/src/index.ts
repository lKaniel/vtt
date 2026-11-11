import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { apiHandler } from './http/api.ts';
import { CharacterStore } from './library/characters.ts';
import { GameHub } from './library/game-hub.ts';
import { httpHandler } from './http/http.ts';
import { OffsiteBackups } from './library/offsite-backups.ts';
import { offsiteFromEnv } from './library/offsite-config.ts';
import { migrateAccounts } from './migrate/migrate-accounts.ts';
import { dataDirFor, repoRoot, gameDirFromArgs } from './paths.ts';
import { SessionStore } from './http/sessions.ts';
import { socketSeat } from './socket-join.ts';
import { startHeartbeat } from './http/heartbeat.ts';

const PORT = Number(process.env.PORT ?? 3001);
const homeDir = gameDirFromArgs();
const clientDist = resolve(repoRoot, 'packages/client/dist');
const dataDir = dataDirFor(homeDir);

/** VTT_ADMIN_PASSWORD, when set to something. */
function adminPassword(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

const hub = new GameHub({ dataDir, home: homeDir });
await hub.load();
const characters = new CharacterStore(dataDir);
await characters.load();
if (await migrateAccounts({ dataDir, hub, characters })) console.log('[server] accounts carried over to players');
const sessions = new SessionStore(dataDir, adminPassword(process.env.VTT_ADMIN_PASSWORD));
await sessions.load();

/** The backup storage .env names; a mistake there is logged rather than stopping the server. */
function offsiteSettings() {
  try {
    return offsiteFromEnv(process.env);
  } catch (e) {
    console.error(`[offsite] no nightly backups: ${(e as Error).message}`);
    return undefined;
  }
}

const offsiteConfig = offsiteSettings();
const offsite = offsiteConfig && new OffsiteBackups({ ...offsiteConfig, hub, dataDir });
if (offsite) {
  await offsite.load();
  offsite.start();
  console.log(`[offsite] nightly backups to ${offsiteConfig.store.describe()}`);
}

const assetsDir = (game?: string) => {
  const dir = hub.dirOf(game ?? hub.homeId ?? '');
  return dir && join(dir, 'assets');
};

const handleRequest = httpHandler({
  assetsDir,
  packFile: (pack, path) => hub.packs.mediaFile(pack, path),
  pluginFile: (plugin, path) => hub.plugins.file(plugin, path),
  clientDir: clientDist,
  api: apiHandler({
    sessions,
    characters,
    hub,
    mcpKey: process.env.VTT_MCP_KEY,
    baileywiki: process.env.VTT_BAILEYWIKI_URL,
    offsite,
  }),
});

const server = createServer((req, res) => {
  handleRequest(req, res).catch((e: unknown) => {
    console.error('[server] request failed:', e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

// A pack file uploaded from Setup over a slow line may take longer than Node's 5 minutes.
server.requestTimeout = 30 * 60_000;

const wss = new WebSocketServer({ noServer: true });
startHeartbeat(() => wss.clients);
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/ws') return socket.destroy();
  void socketSeat(req, { sessions, hub }).then(
    (seat) =>
      wss.handleUpgrade(req, socket, head, (ws) => {
        if (!seat) return ws.close(4001, 'unknown player');
        if (seat.taken) return ws.close(4003, 'someone else plays this seat');
        try {
          hub.connect(seat.game, ws, seat.player, seat.session);
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
    offsite?.stop();
    void hub.close().then(() => process.exit(0));
  });
}
