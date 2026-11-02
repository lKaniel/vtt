import type { GameHub, GameInfo } from '../library/game-hub.ts';
import { HttpError, send, type Call } from './http-json.ts';

// The GM's backups and zip export of one game (games/<id>/backups...,
// games/<id>/export). The lobby has checked that the caller is its GM.

export async function serveArchive(hub: GameHub, call: Call, info: GameInfo): Promise<void> {
  const [, , sub, backup, action] = call.parts;
  const route = `${call.method} ${sub ?? ''}${backup ? '/' : ''}${action ?? ''}`;
  switch (route) {
    case 'GET backups':
      send(call.res, 200, { backups: await hub.backups.list(info.id) });
      return;
    case 'POST backups':
      send(call.res, 200, { backup: await hub.backup(info.id, 'manual') });
      return;
    case 'POST backups/restore':
      await hub.restore(info.id, backup ?? '');
      send(call.res, 200, {});
      return;
    case 'GET export':
      sendZip(call, info, await hub.exportZip(info.id));
      return;
    default:
      throw new HttpError(405, 'Method not allowed.');
  }
}

function sendZip(call: Call, info: GameInfo, zip: Buffer): void {
  call.res.writeHead(200, {
    'content-type': 'application/zip',
    'content-disposition': `attachment; filename="${info.id}.zip"`,
    'content-length': zip.length,
  });
  call.res.end(zip);
}
