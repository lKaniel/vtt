import type { Point, TileDoor, Wall } from '@vtt/shared';

// 3D Canvas door models: a model tile with `doorType` (a door, a chest, a
// rug over a trapdoor, a lever, a drawbridge) opens and shuts by itself in
// 3D Canvas and blocks with its own mesh. Here the blocking and the state
// belong to a door wall through the tile's long middle (so it opens, locks,
// sounds, shows to players as an object and stops movement and sight like
// any door), and the tile's model moves with that wall (`door` on the tile).

interface Flags {
  doorType?: unknown;
  doorState?: unknown;
  doorStyle?: unknown;
  doorAnimateAngle?: unknown;
  doorSlidePercent?: unknown;
  doorAnimationDuration?: unknown;
  doorSound?: unknown;
  collision?: unknown;
  sight?: unknown;
  depth?: unknown;
  model3d?: unknown;
}

interface RawTile {
  _id?: unknown;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  elevation?: number;
  flags?: { 'levels-3d-preview'?: Flags };
}

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return v === undefined || v === '' || !Number.isFinite(n) ? undefined : n;
};

const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

const flagsOf = (raw: unknown): Flags | undefined => (raw as RawTile).flags?.['levels-3d-preview'];

/** Whether a Foundry tile is a 3D Canvas door. */
function isDoorTile(raw: unknown): boolean {
  return (num(flagsOf(raw)?.doorType) ?? 0) !== 0;
}

/** The id of the door wall a door tile moves with. */
const doorWallId = (raw: unknown) => `door-${text((raw as RawTile)._id).toLowerCase()}`;

const STYLES: TileDoor['style'][] = ['fade', 'swing', 'slide', 'lift', 'play', 'rewind'];

/** How a door tile's model moves with its wall. */
export function tileDoorOf(raw: unknown): TileDoor | undefined {
  const f = flagsOf(raw);
  if (!f || !isDoorTile(raw)) return undefined;
  const style = STYLES[num(f.doorStyle) ?? 0] ?? 'fade';
  const angle = num(f.doorAnimateAngle) ?? 90;
  const slide = num(f.doorSlidePercent) ?? 50;
  return {
    wall: doorWallId(raw),
    style,
    ...((style === 'swing' || style === 'slide') && { angle }),
    ...((style === 'slide' || style === 'lift') && { slide }),
    ms: num(f.doorAnimationDuration) ?? 400,
  };
}

const STATES = ['closed', 'open', 'locked'] as const;

/** A door's sound from 3D Canvas's ("woodBasic", "stoneBasic", "metal…"); none said: wood. */
function soundOf(sound: unknown): string | undefined {
  const s = text(sound).toLowerCase();
  if (s.includes('stone')) return 'stone';
  if (s.includes('metal') || s.includes('iron')) return 'iron';
  if (s.includes('gate')) return 'gate';
  return s.includes('wood') ? 'wood' : undefined;
}

/** "chest-01.glb" as a door's name: "Chest 01". */
function nameOf(model: unknown): string | undefined {
  const file = text(model)
    .split('/')
    .pop()
    ?.replace(/\.(glb|gltf)$/i, '');
  if (!file || file.includes(',')) return undefined;
  const words = file.replace(/[-_]+/g, ' ').trim();
  return words && words[0]!.toUpperCase() + words.slice(1);
}

/** The ends of the line through the middle of a (turned) rect, along its longer side. */
function longMiddle(t: { x: number; y: number; width: number; height: number; rotation?: number }): [Point, Point] {
  const centre: Point = [t.x + t.width / 2, t.y + t.height / 2];
  const along = t.width >= t.height;
  const half = (along ? t.width : t.height) / 2;
  const a = (((t.rotation ?? 0) + (along ? 0 : 90)) * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a) * half, Math.sin(a) * half];
  const round = (n: number) => Math.round(n * 100) / 100;
  return [
    [round(centre[0] - dx), round(centre[1] - dy)],
    [round(centre[0] + dx), round(centre[1] + dy)],
  ];
}

/**
 * The door wall a door tile moves with, through its long middle (`at`: the
 * tile's top-left as imported), from its elevation up its depth, blocking
 * what the tile's collision and sight say it does.
 */
export function doorWallOf(
  raw: unknown,
  at: { x: number; y: number },
  grid: { size: number; distance: number },
): Wall | undefined {
  const f = flagsOf(raw);
  if (!f || !isDoorTile(raw)) return undefined;
  const t = raw as RawTile;
  const [a, b] = longMiddle({ ...t, ...at });
  const feet = (units: number) => Math.round(((units * 5) / grid.distance) * 100) / 100;
  const bottom = feet(t.elevation ?? 0);
  const depth = num(f.depth);
  const name = nameOf(f.model3d);
  const sound = soundOf(f.doorSound);
  return {
    id: doorWallId(raw),
    a,
    b,
    door: STATES[num(f.doorState) ?? 0] ?? 'closed',
    ...(num(f.doorType) === 2 && { secret: true }),
    ...(f.collision === false && { move: 'none' as const }),
    ...(f.sight === false && { sight: 'none' as const, light: 'none' as const }),
    ...(sound && { doorSound: sound }),
    ...(name && { name }),
    height: { bottom, ...(depth && { top: bottom + feet((depth / grid.size) * grid.distance) }) },
  };
}
