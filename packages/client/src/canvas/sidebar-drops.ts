import type { Point } from '@vtt/shared';
import { DRAG_TYPE, type DragPayload } from '../play/drops.ts';
import { snapFor } from '../play/interact.ts';
import { moveSelectionTo } from '../play/map-clicks.ts';
import type { Session } from '../session/session.ts';
import type { ItemLayer } from './ItemLayer.ts';

/** The GM drags actors, monsters, items and spells in from the side panel onto the map. */
export function listenToDrops(
  canvas: HTMLCanvasElement,
  session: Session,
  toMap: (x: number, y: number) => Point,
): void {
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

/**
 * A left click on the map with an action ready. Next to a creature it goes at
 * that creature (the pointer snaps to it); an aimed area spell is cast at the
 * point, centred on a creature it snaps to; otherwise the action is put away.
 */
export function clickGround(s: Session, p: Point): void {
  const near = snapFor(s, p);
  const aiming = s.actions.aiming;
  if (near?.kind === 'token' && aimsAtCreatures(s)) return clickCreature(s, near.id);
  if (aiming?.mode === 'point') return s.actions.castAt(near?.kind === 'token' ? near.at : p);
  if (s.actions.armed) return s.actions.arm(undefined);
  if (aiming) s.actions.aim(undefined);
}

const aimsAtCreatures = (s: Session) => !!s.actions.armed || s.actions.aiming?.mode === 'creatures';

/** An attack or spell aimed at creatures, sent at the one the pointer snapped to. */
function clickCreature(s: Session, id: string): void {
  if (s.actions.aiming) s.actions.pickTarget(id);
  else s.actions.attack(id);
}
