// A real game server for one test: the repo's example game copied into a
// fresh folder, its own data folder and port, and the built client.

import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../..');

export interface ServerOptions {
  /** VTT_ADMIN_PASSWORD; unset leaves Setup open until one is set there. */
  adminPassword?: string;
  /** Changes the game's files before the server starts (an encounter set up by hand). */
  prepare?: (gameDir: string) => Promise<void>;
  /** VTT_MCP_KEY: a key for the Claude bridge (POST /mcp) that sits as the home game's GM. */
  mcpKey?: string;
  /** Seeds the server's dice (support/seeded-random.ts), so a spec rolls the same numbers every run. */
  seed?: number;
  /** VTT_BAILEYWIKI_URL: a stand-in for Baileywiki's content server. */
  baileywiki?: string;
  /** VTT_BACKUP_DIR: nightly backups off the server go to a folder next to the game. */
  offsite?: boolean;
}

export interface RunningServer {
  url: string;
  /** The home game's folder (a copy of `world/`). */
  gameDir: string;
  /** The server's data folder: sessions, games.json, backups, new games. */
  dataDir: string;
  stop: () => Promise<void>;
}

/** A port nothing listens on right now. */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === 'object') done(address.port);
        else fail(new Error('no port'));
      });
    });
  });
}

/** Resolves once the server prints that it listens; fails if it exits first. */
function listening(child: ChildProcess, log: string[]): Promise<void> {
  return new Promise((done, fail) => {
    const read = (chunk: Buffer) => {
      log.push(chunk.toString());
      if (log.join('').includes('[server] http://')) done();
    };
    child.stdout?.on('data', read);
    child.stderr?.on('data', read);
    child.once('exit', (code) => fail(new Error(`server exited (${code}):\n${log.join('')}`)));
  });
}

function stopper(child: ChildProcess, root: string) {
  return async () => {
    if (child.exitCode === null) {
      const exited = new Promise((done) => child.once('exit', done));
      child.kill('SIGTERM');
      await exited;
    }
    await rm(root, { recursive: true, force: true });
  };
}

/** The server's environment: only what the spec asks for, never the developer's own settings. */
function serverEnv(options: ServerOptions, root: string, port: number): NodeJS.ProcessEnv {
  const own = /^VTT_(ADMIN_PASSWORD|MCP_KEY|BAILEYWIKI_URL|BACKUP_)/;
  const env: NodeJS.ProcessEnv = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !own.test(name))),
    PORT: String(port),
    VTT_GAME: join(root, 'world'),
    VTT_DATA: join(root, 'data'),
  };
  if (options.adminPassword) env.VTT_ADMIN_PASSWORD = options.adminPassword;
  if (options.mcpKey) env.VTT_MCP_KEY = options.mcpKey;
  if (options.baileywiki) env.VTT_BAILEYWIKI_URL = options.baileywiki;
  if (options.offsite) env.VTT_BACKUP_DIR = join(root, 'offsite');
  return env;
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const root = await mkdtemp(join(tmpdir(), 'vtt-e2e-'));
  const gameDir = join(root, 'world');
  const dataDir = join(root, 'data');
  await cp(join(repoRoot, 'world'), gameDir, { recursive: true });
  await options.prepare?.(gameDir);
  const port = await freePort();
  const env = serverEnv(options, root, port);
  const seeded =
    options.seed === undefined ? [] : ['--import', join(repoRoot, 'packages/e2e/support/seeded-random.ts')];
  if (options.seed !== undefined) env.E2E_RANDOM_SEED = String(options.seed);
  const child = spawn(process.execPath, ['--import', 'tsx', ...seeded, 'src/index.ts'], {
    cwd: join(repoRoot, 'packages/server'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log: string[] = [];
  const stop = stopper(child, root);
  try {
    await listening(child, log);
  } catch (e) {
    await stop();
    throw e;
  }
  return { url: `http://localhost:${port}`, gameDir, dataDir, stop };
}
