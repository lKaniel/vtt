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

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const root = await mkdtemp(join(tmpdir(), 'vtt-e2e-'));
  const gameDir = join(root, 'world');
  const dataDir = join(root, 'data');
  await cp(join(repoRoot, 'world'), gameDir, { recursive: true });
  await options.prepare?.(gameDir);
  const port = await freePort();
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), VTT_GAME: gameDir, VTT_DATA: dataDir };
  delete env.VTT_ADMIN_PASSWORD;
  delete env.VTT_MCP_KEY;
  if (options.adminPassword) env.VTT_ADMIN_PASSWORD = options.adminPassword;
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
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
