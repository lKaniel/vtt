import { tileClickable } from '@vtt/shared';
import type { MenuItem } from '../editor/menus.ts';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { actor, approach, clickTile, openDoor } from './interact.ts';
import type { MapObject } from './objects.ts';

// What a player (or the GM) may do with an object (objects.ts): the entries
// of its right-click menu and the buttons of its inspect card. Each does what
// a click would, walking up to it first.

/** Inspect, then the object's uses. */
export function objectMenu(s: Session, obj: MapObject): MenuItem[] {
  return [{ label: t('object.inspect'), run: () => s.inspect.open(obj.ref) }, ...objectUses(s, obj)];
}

/** What can be done with the object: open a door, use a lever, open a chest. */
export function objectUses(s: Session, obj: MapObject): MenuItem[] {
  if (obj.snap.kind === 'door') return doorUses(s, obj.snap);
  if (obj.ref.kind === 'pile') return pileUses(s, obj);
  return tileUses(s, obj.ref.id);
}

function doorUses(s: Session, snap: Extract<MapObject['snap'], { kind: 'door' }>): MenuItem[] {
  const { chunk, wall } = snap;
  const gm = s.isGm();
  const locked = wall.door === 'locked';
  const open = wall.door === 'open';
  const swing = { label: t(open ? 'object.close' : 'object.open'), run: () => openDoor(s, chunk, wall, false) };
  const lock = { label: t(locked ? 'object.unlock' : 'object.lock'), run: () => openDoor(s, chunk, wall, true) };
  return [...(locked ? [] : [swing]), ...(gm ? [lock] : [])];
}

function tileUses(s: Session, id: string): MenuItem[] {
  const tile = [...s.chunks.values()].flatMap((c) => c.tiles).find((tile) => tile.id === id);
  return tile && tileClickable(tile, s.isGm()) ? [{ label: t('object.use'), run: () => clickTile(s, id) }] : [];
}

function pileUses(s: Session, obj: MapObject): MenuItem[] {
  const open = { label: t('object.open'), run: () => s.piles.open(obj.ref.id) };
  const walker = actor(s);
  if (!walker || s.isGm()) return [open];
  return [open, { label: t('object.walkUp'), run: () => approach(s, obj.snap) }];
}
