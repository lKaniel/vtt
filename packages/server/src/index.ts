import { createServer, type IncomingMessage } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { apiHandler } from './http/api.ts';
import { CharacterStore } from './library/characters.ts';
import { GameHub } from './library/game-hub.ts';
import { httpHandler } from './http/http.ts';
import { sessionToken } from './http/http-json.ts';
import { BaileywikiAccount } from './foundry/baileywiki-account.ts';
import { BAILEYWIKI_URL } from './foundry/baileywiki-client.ts';
import { BaileywikiFiles } from './foundry/baileywiki-files.ts';
import { refreshBaileywikiLibrary } from './foundry/baileywiki-online.ts';
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

const baileywikiAccount = new BaileywikiAccount(
  dirname(hub.packs.dir),
  process.env.VTT_BAILEYWIKI_URL ?? BAILEYWIKI_URL,
);
const baileywikiFiles = new BaileywikiFiles(baileywikiAccount, hub.packs.dir);
// A library an older server imported is made again from the module on disk, in the background.
refreshBaileywikiLibrary(hub.packs.dir, (line) => console.log(`[baileywiki] ${line}`))
  .then((report) => report && hub.packs.load())
  .catch((e: unknown) => console.error('[baileywiki] refreshing the library failed:', e));

/** Baileywiki's files are fetched only for someone at a table or in Setup, never a passer-by. */
const packFetch = (pack: string, path: string, req: IncomingMessage) => {
  const session = sessions.get(sessionToken(req));
  const known = !!session && (session.admin || Object.keys(session.seats).length > 0);
  return known ? baileywikiFiles.fetch(pack, path) : Promise.resolve(undefined);
};

const handleRequest = httpHandler({
  assetsDir,
  packFile: (pack, path) => hub.packs.mediaFile(pack, path),
  packFetch,
  pluginFile: (plugin, path) => hub.plugins.file(plugin, path),
  clientDir: clientDist,
  api: apiHandler({
    sessions,
    characters,
    hub,
    mcpKey: process.env.VTT_MCP_KEY,
    baileywiki: process.env.VTT_BAILEYWIKI_URL,
    baileywikiModule: process.env.VTT_BAILEYWIKI_MODULE,
    baileywikiAccount,
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
