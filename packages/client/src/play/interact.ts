import { bodyOf, type Point, type Wall } from '@vtt/shared';
import type { Session } from '../session/session.ts';
import { interactSpot, type Snap, snapAt } from './snapping.ts';

// Using what the pointer snaps to (snapping.ts), as in BG3: a player's
// creature walks up to a door or a lever first, then uses it. The GM, who
// opens doors to run the map, uses them where they are.

/** What the pointer at `p` snaps to for this player; `tokens: false` leaves creatures out. */
export function snapFor(s: Session, p: Point, { tokens = true } = {}): Snap | undefined {
  if (!s.world) return undefined;
  const scene = { tokens: tokens ? s.tokens.values() : [], chunks: s.chunks, gridSize: s.world.gridSize, gm: s.isGm() };
  return snapAt(p, scene);
}

/** A click on the ground: uses the door or tile it snaps to. False when it snaps to neither. */
export function clickSnapped(s: Session, at: Point): boolean {
  const snap = snapFor(s, at, { tokens: false });
  if (snap?.kind === 'door') openDoor(s, snap.chunk, snap.wall, false);
  else if (snap?.kind === 'tile') clickTile(s, snap.id);
  return snap?.kind === 'door' || snap?.kind === 'tile';
}

/** Click opens or closes a door (after walking up to it); shift-click lets the GM lock or unlock it. */
export function openDoor(s: Session, chunk: string, wall: Wall, shift: boolean): void {
  if (s.isGm() && shift) return s.requests.setDoor(chunk, wall.id, wall.door === 'locked' ? 'closed' : 'locked');
  if (wall.door === 'locked') return s.showError('The door is locked');
  approach(s, { kind: 'door', chunk, wall, at: [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2] });
  s.requests.setDoor(chunk, wall.id, wall.door === 'open' ? 'closed' : 'open');
}

/** Clicks a tile with a trigger, after walking up to it, with the creature you act with. */
export function clickTile(s: Session, id: string): void {
  const tile = [...s.chunks.values()].flatMap((c) => c.tiles).find((t) => t.id === id);
  if (tile)
    approach(s, { kind: 'tile', id, at: [tile.x + tile.w / 2, tile.y + tile.h / 2], r: Math.min(tile.w, tile.h) / 2 });
  const acting = actor(s);
  s.requests.useTile(id, acting?.id);
}

/** The creature you act with: selected, and yours to control. */
function actor(s: Session) {
  const token = s.selected ? s.tokens.get(s.selected) : undefined;
  return token && s.canControl(token) ? token : undefined;
}

/** A player's creature walks up to `snap` unless it is there already. */
function approach(s: Session, snap: Snap): void {
  const token = actor(s);
  if (!token || s.isGm() || !s.world) return;
  const g = s.world.gridSize;
  const spot = interactSpot(bodyOf(token, g), snap, g);
  if (Math.hypot(spot[0] - token.x, spot[1] - token.y) > 2) s.requests.move(token.id, spot);
}

/**
 * A left click on the map with an action ready, as in BG3. Next to a creature
 * it goes at that creature (the pointer snaps to it); otherwise it goes at
 * the ground there: an area is centred on the point (or on a creature it
 * snaps to), and an attack or a spell aimed at creatures is spent on empty
 * ground (with any targets already picked). Right click or Esc puts it away.
 */
export function clickGround(s: Session, p: Point): void {
  const near = snapFor(s, p);
  const aiming = s.actions.aiming;
  if (near?.kind === 'token' && aimsAtCreatures(s)) return clickCreature(s, near.id);
  if (aiming?.mode === 'point') return s.actions.castAt(near?.kind === 'token' ? near.at : p);
  if (s.actions.armed) return s.actions.attackAt(p);
  if (aiming?.mode === 'creatures') s.actions.castAt(p);
}

const aimsAtCreatures = (s: Session) => !!s.actions.armed || s.actions.aiming?.mode === 'creatures';

/** An attack or spell aimed at creatures, sent at the one the pointer snapped to. */
function clickCreature(s: Session, id: string): void {
  if (s.actions.aiming) s.actions.pickTarget(id);
  else s.actions.attack(id);
}
