import { OpError, type DocStore, type Op } from '@vtt/core';
import type { Game } from '@vtt/shared';
import { SCENES } from './store-colls.ts';

// Deleting a scene deletes everything on it in the same transaction, so one
// undo brings the whole scene back. The scene the game is on stays.

/** The extra ops that clear the scenes `ops` delete; throws for the game's own scene. */
export function sceneDeleteOps(docs: DocStore, game: Game, ops: readonly Op[]): Op[] {
  const gone = ops.flatMap((op) => (op.op === 'delete' && op.coll === SCENES ? [op.id] : []));
  if (gone.includes(game.scene)) throw new OpError('Activate another scene before deleting this one');
  const named = new Set(ops.map((op) => `${op.coll}\u0000${op.op === 'create' ? op.doc.id : op.id}`));
  return gone.flatMap((scene) =>
    docs
      .collections()
      .filter((coll) => coll.startsWith(`${scene}/`))
      .flatMap((coll) => docs.all(coll).map((d): Op => ({ op: 'delete', coll, id: d.id })))
      .filter((op) => op.op === 'delete' && !named.has(`${op.coll}\u0000${op.id}`)),
  );
}
