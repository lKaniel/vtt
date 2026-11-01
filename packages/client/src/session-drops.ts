import type { ClientMessage, SheetArea } from '@vtt/system-dnd5e';
import type { Point } from '@vtt/shared';
import { dropMessage, type DragPayload, sheetDropMessage } from './drops.ts';
import type { Session } from './session.ts';

// What the session does with a drop: pictures become tiles and journal
// entries notes here; the rest goes to the server (see drops.ts).

/** Something dragged from the side panel or a sheet's inventory, let go on the map at `p`. */
export function dropOnMap(s: Session, payload: DragPayload, p: Point): void {
  if (!s.world) return;
  if (payload.kind === 'media') {
    const size = payload.w && payload.h ? { w: payload.w, h: payload.h } : undefined;
    return s.placeMedia(payload.src, p, size);
  }
  if (payload.kind === 'journal') {
    return s.createItem({ mode: 'notes', data: { x: p[0], y: p[1], entry: payload.id, label: payload.name } });
  }
  const ctx = { tokens: s.tokens.values(), gridSize: s.world.gridSize, hidden: s.spawnHidden };
  send(s, dropMessage(payload, p, ctx));
}

/** Something let go on the open character sheet, on its `area` when it landed on one. */
export function dropOnOpenSheet(s: Session, payload: DragPayload, area?: SheetArea): void {
  const target = s.sheet;
  if (!target) return;
  const actor = target.kind === 'actor' ? s.actors.get(target.id) : undefined;
  if (actor && payload.kind === 'media') return s.saveActor({ ...actor, img: payload.src });
  send(s, sheetDropMessage(payload, { kind: target.kind, id: target.id }, area));
}

function send(s: Session, msg: ClientMessage | { error: string } | undefined): void {
  if (!msg) return;
  if ('error' in msg) s.showError(msg.error);
  else s.send(msg);
}
