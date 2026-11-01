import type { DocRef } from '@vtt/core';

// The editor's selection: a list of document keys, changed by clicks and
// marquees with Figma's modifiers.

export interface Mods {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

/** The modifier keys of a pointer event (Cmd counts as Ctrl). */
export function modsOf(e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): Mods {
  return { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey };
}

/** A document reference as one string, "<coll>#<id>". */
export const keyOf = (ref: DocRef): string => `${ref.coll}#${ref.id}`;

export function refOf(key: string): DocRef {
  const at = key.lastIndexOf('#');
  return { coll: key.slice(0, at), id: key.slice(at + 1) };
}

/** A click on `hit` (or on empty space): select it alone; shift toggles it, ctrl takes it away. */
export function clickSelect(selection: readonly string[], hit: string | undefined, mods: Mods): string[] {
  if (!hit) return mods.shift || mods.ctrl ? [...selection] : [];
  if (mods.ctrl) return selection.filter((k) => k !== hit);
  if (!mods.shift) return [hit];
  return selection.includes(hit) ? selection.filter((k) => k !== hit) : [...selection, hit];
}

/** A marquee that caught `hits`: they become the selection; shift adds them, ctrl takes them away. */
export function marqueeSelect(selection: readonly string[], hits: readonly string[], mods: Mods): string[] {
  if (mods.ctrl) return selection.filter((k) => !hits.includes(k));
  if (mods.shift) return [...selection, ...hits.filter((k) => !selection.includes(k))];
  return [...hits];
}
