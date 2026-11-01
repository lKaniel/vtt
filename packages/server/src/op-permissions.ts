import { type Change, type Doc, docPatch, type Op, type Patch } from '@vtt/core';
import { canControl, canEdit, isGm, lockedPatchKeys, type Player, sceneCollOf } from '@vtt/shared';
import { sameJson } from '@vtt/system-dnd5e';
import type { DocAccess, OwnedDoc } from './store-access.ts';
import { Refusal } from './table.ts';

// Who may change which documents (design doc, "Permissions"). The GM may
// change anything. Anyone else changes documents one field at a time:
// fields that place or own a creature are the GM's, the action bar is its
// owner's, and everything else needs a trusted owner. Adding and removing
// documents stays with the GM. Undo goes through the same check, so a
// player can't undo their way past it.

/** Fields an owner may change without being trusted to edit the sheet. */
const CONTROL_FIELDS = new Set(['hotbar']);

const nameOf = (doc: OwnedDoc, id: string): string => (typeof doc.name === 'string' ? doc.name : id);

/** The fields a patch changes; an unlinked copy's `delta` counts by the fields inside it. */
function changedKeys(doc: Doc, patch: Patch): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (sameJson(doc[key] ?? null, value)) continue;
    if (key === 'delta') keys.push(...changedKeys((doc.delta ?? {}) as Doc, fullPatch(doc.delta, value)));
    else keys.push(key);
  }
  return keys;
}

/** A whole-object replacement as a patch: every old key not in `next` is removed. */
function fullPatch(before: unknown, next: unknown): Patch {
  const old = before && typeof before === 'object' ? Object.keys(before) : [];
  const now = next && typeof next === 'object' ? (next as Patch) : {};
  return { ...Object.fromEntries(old.map((k) => [k, null])), ...now };
}

function checkUpdate(player: Player, access: DocAccess, op: Extract<Op, { op: 'update' }>): void {
  const doc = access.get(op.coll, op.id);
  if (!doc) return; // The store reports the missing document.
  const owned = access.owned(op.coll, doc);
  const keys = changedKeys(doc, op.patch);
  const locked = lockedPatchKeys(Object.fromEntries(keys.map((k) => [k, true])), player);
  if (locked.length) throw new Refusal(`Only the GM can change ${locked.join(', ')}`);
  const may = keys.every((k) => CONTROL_FIELDS.has(k)) ? canControl : canEdit;
  if (!may(owned, player)) throw new Refusal(`You can't edit ${nameOf(owned, op.id)}`);
}

/** Drawings and templates: a player adds their own (`author`), and changes or removes only those. */
const AUTHORED = new Set(['drawings', 'templates']);
const authored = (coll: string) => AUTHORED.has(sceneCollOf(coll)?.name ?? '');

/** True when the op is on a player's own drawing or template and allowed; throws when it isn't. */
function checkAuthored(player: Player, access: DocAccess, op: Op): boolean {
  if (!authored(op.coll) || player.role === 'observer') return false;
  if (op.op === 'create') return op.doc.author === player.id;
  const doc = access.get(op.coll, op.id);
  if (!doc) return true; // The store reports the missing document.
  if (doc.author !== player.id) throw new Refusal(`You can't edit ${nameOf(doc as OwnedDoc, op.id)}`);
  if (op.op === 'update' && 'author' in op.patch && op.patch.author !== player.id) {
    throw new Refusal('Only the GM can change author');
  }
  return true;
}

function checkOp(player: Player, access: DocAccess, op: Op): void {
  if (checkAuthored(player, access, op)) return;
  if (op.op === 'update') return checkUpdate(player, access, op);
  if (op.op === 'create') throw new Refusal(`Only the GM can add ${nameOf(op.doc as OwnedDoc, op.doc.id)}`);
  const doc = access.get(op.coll, op.id);
  throw new Refusal(`Only the GM can remove ${doc ? nameOf(access.owned(op.coll, doc), op.id) : op.id}`);
}

/** Throws a Refusal naming the first op `player` may not make. */
export function checkOps(player: Player, ops: readonly Op[], access: DocAccess): void {
  if (isGm(player)) return;
  for (const op of ops) checkOp(player, access, op);
}

/** The ops that would put back what `changes` did, without minding revisions: for checking permission. */
export function undoOps(access: DocAccess, changes: readonly Change[]): Op[] {
  return changes.flatMap(({ coll, id, before }): Op[] => {
    const now = access.get(coll, id);
    if (!now) return before ? [{ op: 'create', coll, doc: before }] : [];
    if (!before) return [{ op: 'delete', coll, id }];
    return [{ op: 'update', coll, id, patch: docPatch(now, before) }];
  });
}
