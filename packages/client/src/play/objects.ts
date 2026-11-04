import { type Chunk, type DrawnTile, type Point, tileClickable, type Wall } from '@vtt/shared';
import type { TokenView } from '@vtt/system-dnd5e';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { type Snap, snapAt } from './snapping.ts';

// Objects, as in BG3: the things on the map a player looks at and uses
// rather than fights. They are kept as what they already are (a door is a
// wall, a lever or a statue is a tile, a chest is a pile token), and this
// file shows each of them the same way: a name, what it says when
// inspected, its state, and where it stands. Its uses are object-uses.ts.

/** Which thing on the map an object is. */
export type ObjectRef =
  { kind: 'door'; chunk: string; id: string } | { kind: 'tile'; id: string } | { kind: 'pile'; id: string };

export interface MapObject {
  ref: ObjectRef;
  name: string;
  /** What players read when they inspect it. */
  description?: string;
  /** Its picture: a tile's, or a pile's token art. */
  img?: string;
  /** Its state in words: open, locked, a merchant. */
  state?: string;
  /** Where it stands (its middle), as the pointer snaps to it. */
  snap: Snap;
}

/** The object at `p` that this player may see: a door, a pile, or a tile that answers clicks or says something. */
export function objectAt(s: Session, p: Point): MapObject | undefined {
  if (!s.world) return undefined;
  const piles = [...s.tokens.values()].filter((tok) => tok.pile);
  const snap = snapAt(p, { tokens: piles, chunks: s.chunks, gridSize: s.world.gridSize, gm: s.isGm() });
  if (snap) return fromSnap(s, snap);
  const tile = allTiles(s).findLast((tile) => !!tile.description && inTile(tile, p));
  return tile && tileObject(tile, s.isGm());
}

/** The object `ref` names as it is now, if it is still there. */
export function objectOf(s: Session, ref: ObjectRef): MapObject | undefined {
  if (ref.kind === 'pile') {
    const token = s.tokens.get(ref.id);
    return token?.pile ? pileObject(token, s.world?.gridSize ?? 100) : undefined;
  }
  if (ref.kind === 'tile') {
    const tile = allTiles(s).find((tile) => tile.id === ref.id);
    return tile && tileObject(tile, s.isGm());
  }
  const wall = s.chunks.get(ref.chunk)?.walls.find((w) => w.id === ref.id);
  return wall?.door ? doorObject(ref.chunk, wall, s.isGm()) : undefined;
}

function fromSnap(s: Session, snap: Snap): MapObject | undefined {
  if (snap.kind === 'door') return doorObject(snap.chunk, snap.wall, s.isGm());
  return objectOf(s, { kind: snap.kind === 'token' ? 'pile' : 'tile', id: snap.id });
}

const allTiles = (s: Session): DrawnTile[] => [...s.chunks.values()].flatMap((c: Chunk) => c.tiles);

const inTile = (tile: DrawnTile, p: Point) =>
  p[0] >= tile.x && p[0] <= tile.x + tile.w && p[1] >= tile.y && p[1] <= tile.y + tile.h;

const DOOR_STATE = {
  open: 'object.state.open',
  closed: 'object.state.closed',
  locked: 'object.state.locked',
} as const;

function doorObject(chunk: string, wall: Wall, gm: boolean): MapObject {
  const at: Point = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
  const state = [t(DOOR_STATE[wall.door ?? 'closed']), gm && wall.secret && t('object.state.secret')];
  return {
    ref: { kind: 'door', chunk, id: wall.id },
    name: wall.name ?? t('object.door'),
    ...(wall.description && { description: wall.description }),
    state: state.filter(Boolean).join(', '),
    snap: { kind: 'door', chunk, wall, at },
  };
}

function tileObject(tile: DrawnTile, gm: boolean): MapObject {
  const src = tile.kind === 'image' ? tile.src : undefined;
  const off = tile.trigger && !tileClickable(tile, gm) && gm;
  return {
    ref: { kind: 'tile', id: tile.id },
    name: tileName(tile),
    ...(tile.description && { description: tile.description }),
    ...(src && { img: src }),
    ...(off && { state: t('object.state.off') }),
    snap: {
      kind: 'tile',
      id: tile.id,
      at: [tile.x + tile.w / 2, tile.y + tile.h / 2],
      r: Math.min(tile.w, tile.h) / 2,
    },
  };
}

/** A tile's name, else one read off its model's or picture's file, else "Object". */
function tileName(tile: DrawnTile): string {
  const file = tile.kind === 'image' ? (tile.model?.src ?? tile.src) : undefined;
  return tile.name ?? (file && nameFromFile(file)) ?? t('object.thing');
}

function pileObject(token: TokenView, gridSize: number): MapObject {
  const pile = token.pile!;
  const state = [t(pile.kind === 'merchant' ? 'object.state.merchant' : 'object.state.loot')];
  if (pile.locked) state.push(t('object.state.locked'));
  const img = token.img ?? token.art;
  return {
    ref: { kind: 'pile', id: token.id },
    name: token.name,
    ...(token.biography && { description: token.biography }),
    ...(img && { img }),
    state: state.join(', '),
    snap: { kind: 'token', id: token.id, name: token.name, at: [token.x, token.y], r: (token.size * gridSize) / 2 },
  };
}

/** A name read off a picture's file name ("Props/Lever_Wood-02.webp": "Lever wood"); none when it is only numbers. */
export function nameFromFile(path: string): string | undefined {
  const base = path
    .split(/[\\/]/)
    .at(-1)!
    .replace(/\.[a-z0-9]+$/i, '');
  const words = base
    .split(/[\s_.-]+/)
    .filter((w) => w && !/^\d+$/.test(w))
    .map((w) => w.toLowerCase());
  if (!words.length) return undefined;
  const text = words.join(' ');
  return text[0]!.toUpperCase() + text.slice(1);
}
