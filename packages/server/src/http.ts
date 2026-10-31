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
  /** World assets, served under /assets/. */
  assetsDir: string;
  /** The built client; unknown paths fall back to its index.html. */
  clientDir: string;
  players: () => readonly Player[];
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

/** Plain HTTP: the seat list, world assets and the built client. */
export function httpHandler(opts: HttpOptions): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (opts.api && (await opts.api(req, res))) return;
    if (url.pathname === '/api/players') {
      // Self-hosted for friends: anyone who can reach the server may pick a seat.
      const players = opts.players().map(({ id, name, role, color }) => ({ id, name, role, color }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(players));
      return;
    }
    const served =
      (url.pathname.startsWith('/assets/') && (await serveFile(res, opts.assetsDir, url.pathname.slice(8)))) ||
      (await serveFile(res, opts.clientDir, url.pathname)) ||
      (await serveFile(res, opts.clientDir, 'index.html'));
    if (!served) res.writeHead(404).end('Not found. In development, open the Vite dev server instead.');
  };
}
