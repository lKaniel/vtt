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
};

export interface HttpOptions {
  /**
   * A game's assets folder, served under /games/<id>/assets/; undefined is
   * the home game, also served under /assets/ as before games had a lobby.
   */
  assetsDir: (game?: string) => string | undefined;
  /** The built client; unknown paths fall back to its index.html. */
  clientDir: string;
  /** The home game's seats, for taking one without an account. */
  players: () => readonly Player[] | Promise<readonly Player[]>;
  /** Account routes; answers true when it handled the request. */
  api?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
}

/** Streams a file from inside `root`, refusing paths that escape it. */
async function serveFile(res: ServerResponse, root: string, urlPath: string): Promise<boolean> {
  const path = normalize(join(root, decodeURIComponent(urlPath)));
  if (path !== root && !path.startsWith(root + sep)) return false;
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
      (await serveFile(res, opts.clientDir, url.pathname)) ||
      (await serveFile(res, opts.clientDir, 'index.html'));
    if (!served) res.writeHead(404).end('Not found. In development, open the Vite dev server instead.');
  };
}
