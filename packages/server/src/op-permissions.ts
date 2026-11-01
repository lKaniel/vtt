import { docPatch, type Change, type Doc, type Op, type Patch } from '@vtt/core';
import { canControl, canEdit, canObserve, canSee, isGm, lockedPatchKeys, sameJson, type Player } from '@vtt/shared';
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

function checkOp(player: Player, access: DocAccess, op: Op): void {
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

/** Whether a player is sent a document: only those they see and may read in full. The GM gets all. */
export function sendsDoc(player: Player, access: DocAccess, coll: string, doc: Doc): boolean {
  if (isGm(player)) return true;
  if (!isOwnable(coll)) return false;
  const owned = access.owned(coll, doc);
  return canSee(owned, player) && canObserve(owned, player);
}

/** Collections whose documents carry ownership: actors and tokens, for now. */
function isOwnable(coll: string): boolean {
  return coll === 'actors' || coll.endsWith('/tokens');
}
