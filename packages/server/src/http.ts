import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import type { Player } from '@vtt/shared';

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
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
};

export interface HttpOptions {
  /**
   * A game's assets folder, served under /games/<id>/assets/; undefined is
   * the home game, also served under /assets/ as before games had a lobby.
   */
  assetsDir: (game?: string) => string | undefined;
  /** The built client; unknown paths fall back to its index.html. */
  clientDir: string;
  /** The file of an installed pack's media (`/packs/<pack>/<path>`), or undefined if it has none there. */
  packFile?: (pack: string, path: string) => string | undefined;
  /** The home game's seats, for taking one without an account. */
  players: () => readonly Player[] | Promise<readonly Player[]>;
  /** Account routes; answers true when it handled the request. */
  api?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
}

/** Streams a file from inside `root`, refusing paths that escape it. */
async function serveFile(res: ServerResponse, root: string, urlPath: string): Promise<boolean> {
  const path = normalize(join(root, decodeURIComponent(urlPath)));
  if (path !== root && !path.startsWith(root + sep)) return false;
  return servePath(res, path);
}

async function servePath(res: ServerResponse, path: string): Promise<boolean> {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) return false;
  res.writeHead(200, { 'content-type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
  return true;
}

/** /assets/<path> of the home game, or /games/<id>/assets/<path>. */
async function serveAsset(res: ServerResponse, opts: HttpOptions, path: string): Promise<boolean> {
  const match = /^\/games\/([a-z0-9-]+)\/assets\/(.*)$/.exec(path);
  if (!match && !path.startsWith('/assets/')) return false;
  const [game, rest] = match ? [match[1], match[2]!] : [undefined, path.slice(8)];
  const dir = opts.assetsDir(game);
  return !!dir && serveFile(res, dir, rest);
}

/** /packs/<pack>/<path>: media of an installed pack (see pack-store.ts). */
async function servePack(res: ServerResponse, opts: HttpOptions, path: string): Promise<boolean> {
  const match = /^\/packs\/([a-z0-9-]+)\/(.+)$/.exec(path);
  const file = match && opts.packFile?.(match[1]!, decodeURIComponent(match[2]!));
  return !!file && servePath(res, file);
}

/** Plain HTTP: the home game's seat list, game assets and the built client. */
export function httpHandler(opts: HttpOptions): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (opts.api && (await opts.api(req, res))) return;
    if (url.pathname === '/api/players') {
      // Self-hosted for friends: anyone who can reach the server may pick a seat.
      const players = (await opts.players()).map(({ id, name, role, color }) => ({ id, name, role, color }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(players));
      return;
    }
    const served =
      (await serveAsset(res, opts, url.pathname)) ||
      (await servePack(res, opts, url.pathname)) ||
      (await serveFile(res, opts.clientDir, url.pathname)) ||
      (await serveFile(res, opts.clientDir, 'index.html'));
    if (!served) res.writeHead(404).end('Not found. In development, open the Vite dev server instead.');
  };
}
