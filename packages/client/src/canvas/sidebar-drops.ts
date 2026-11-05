import type { Point } from '@vtt/shared';
import { DRAG_TYPE, type DragPayload } from '../play/drops.ts';
import { moveSelectionTo } from '../play/map-clicks.ts';
import type { Session } from '../session/session.ts';
import type { ItemLayer } from './ItemLayer.ts';

/**
 * The GM drags actors, monsters, items and spells in from the side panel onto
 * the map: `canvas` is the 2D map's canvas, or the 3D view over it.
 * `toMap` takes a point on it (from its top left).
 */
export function listenToDrops(canvas: HTMLElement, session: Session, toMap: (x: number, y: number) => Point): void {
  canvas.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  canvas.addEventListener('drop', (e) => {
    const data = e.dataTransfer?.getData(DRAG_TYPE);
    if (!data) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    session.drops.onMap(JSON.parse(data) as DragPayload, toMap(e.clientX - rect.left, e.clientY - rect.top));
  });
}

/** A token let go on the map: dragged to `at`, it walks there with the rest of the selection; a click selects it alone. */
export function dropToken(s: Session, id: string, at: Point | undefined): void {
  if (!at) return s.select(id);
  moveSelectionTo(s, at, id);
}

/** In the tokens mode, a click on a map note opens its journal entry. */
export function openNote(s: Session, items: ItemLayer, at: Point): boolean {
  const note = s.editor.mode === 'tokens' ? items.noteAt(at) : undefined;
  if (note) s.journal.open(note.entry, note.page);
  return !!note;
}
