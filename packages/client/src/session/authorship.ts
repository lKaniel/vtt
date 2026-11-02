import type { Clip, DocRef, DocStore } from '@vtt/core';
import { isGm, type Player } from '@vtt/shared';

// What players may make and change themselves on the map. Players draw and
// place templates of their own: those carry their id as `author`, and they
// may copy, paste, change and delete only those. The GM may do anything.

/** The kinds players make and own. */
const AUTHORED = new Set(['drawing', 'template']);

const gm = (you: Player | undefined) => !!you && isGm(you);

/** The GM edits anything; a player only drawings and templates of their own. */
export function mayEditRefs(you: Player | undefined, docs: DocStore, refs: readonly DocRef[]): boolean {
  if (gm(you)) return true;
  if (!refs.length || !you) return false;
  return refs.every((ref) => {
    const doc = docs.get(ref.coll, ref.id);
    return !!doc && AUTHORED.has(doc.type) && doc.author === you.id;
  });
}

/** What of a clip `you` may paste: the GM all of it, a player only drawings and templates, signed as theirs. */
export function pastableBy(you: Player | undefined, clip: Clip): Clip | undefined {
  if (gm(you)) return clip;
  const docs = clip.docs.filter((d) => AUTHORED.has(d.type)).map((d) => ({ ...d, author: you?.id }));
  return docs.length && you ? { docs } : undefined;
}

/** Whether `you` may work in an editor mode: the GM any, a player the tokens, drawings and templates. */
export function mayUseMode(you: Player | undefined, mode: string): boolean {
  return gm(you) || mode === 'tokens' || mode === 'drawings' || mode === 'templates';
}

/** Players sign what they make. */
export function signature(you: Player | undefined, type: string): Record<string, unknown> {
  return !gm(you) && you && AUTHORED.has(type) ? { author: you.id } : {};
}
