import { type AssetQuery, type PackAsset, seeded } from '@vtt/core';
import { z } from 'zod';
import type { Blueprint, Builder } from './scene-blueprint.ts';

// The parts of a blueprint built from the game's asset catalogs (a
// Baileywiki pack, core/asset-catalog.ts): props (one asset by id or words,
// at its real size), scatter (an area filled with them, kept apart, the
// same for a seed) and grounds (patches of a tileable texture at its own
// scale). Room floors and the scene's ground take a catalog texture too
// when one matches, so maps come out in the pack's art without asking.

const num = z.number();
const kind = z.enum(['tile', 'model']).optional().describe('tile: a 2D picture; model: 3D. Default: what the scene is');
const onFloor = {
  level: z.string().optional(),
  levels: z.array(z.string()).optional(),
};

export const PropSchema = z.looseObject({
  asset: z.string().min(1).describe('A catalog id, or words to find one (find_assets): "oak tree", "wagon"'),
  x: num,
  y: num,
  kind,
  rotation: num.optional().describe('Degrees clockwise'),
  scale: num.positive().default(1),
  seed: z.number().int().optional().describe('Which of the matches (words find several)'),
  ...onFloor,
});

const AreaBox = z.object({ x: num, y: num, w: num.positive(), h: num.positive() });

export const ScatterSchema = z.object({
  assets: z.array(z.string().min(1)).min(1).describe('Ids or words, used in turn: ["oak tree", "pine tree", "bush"]'),
  ...AreaBox.shape,
  count: z.number().int().min(1).max(500).optional().describe('How many; default about one per 8 squares'),
  spacing: num.positive().optional().describe('Least distance between their middles; default 0.6 of their size'),
  avoid: z.array(AreaBox).default([]).describe('Boxes kept clear: paths, buildings, the fight'),
  scale: z.tuple([num.positive(), num.positive()]).default([0.85, 1.15]),
  turn: z.boolean().default(true).describe('Turn each a random way'),
  kind,
  minFeet: num.positive().optional(),
  maxFeet: num.positive().optional(),
  seed: z.number().int().default(1),
  ...onFloor,
});

export const GroundSchema = z.object({
  texture: z.string().min(1).describe('A catalog texture id or words: "grass", "forest", "cobblestone", "cave"'),
  ...AreaBox.shape,
  edge: z.enum(['rough', 'straight']).default('rough'),
  tint: z.string().optional(),
  repeat: num.positive().optional().describe('Squares one repeat covers; default the texture’s own size'),
  seed: z.number().int().optional(),
  ...onFloor,
});

type Kind = 'tile' | 'model';
export type FindAssets = (q: { search: string; kind?: PackAsset['kind'] }) => readonly PackAsset[];

/** Every catalog search a blueprint needs, once each. */
export function assetQueries(bp: Blueprint, prefer: Kind): (AssetQuery & { search: string })[] {
  const out = new Map<string, AssetQuery & { search: string }>();
  const ask = (search: string, k: PackAsset['kind']) => out.set(`${k}:${search}`, { search, kind: k });
  for (const p of bp.props) ask(p.asset, p.kind ?? prefer);
  for (const s of bp.scatter) for (const a of s.assets) ask(a, s.kind ?? prefer);
  for (const g of bp.grounds) ask(g.texture, 'texture');
  for (const texture of texturesOf(bp)) ask(texture, 'texture');
  return [...out.values()];
}

/** The ground textures a blueprint's rooms and painted tiles name, which a catalog texture may stand for. */
function texturesOf(bp: Blueprint): string[] {
  const floors = bp.rooms.flatMap((r) => (r.floor && !r.floor.startsWith('#') ? [r.floor] : []));
  const painted = bp.tiles.flatMap((t) => (typeof t.texture === 'string' && !t.src ? [t.texture] : []));
  return [...floors, ...painted];
}

/** One of the assets words find, by seed; the other kind (tile or model) when the one asked for has none. */
export function chooseAsset(find: FindAssets, what: string, k: Kind | 'texture', seed: number): PackAsset | undefined {
  let found = find({ search: what, kind: k });
  if (!found.length && k !== 'texture') found = find({ search: what, kind: k === 'tile' ? 'model' : 'tile' });
  if (!found.length) return undefined;
  const top = found.slice(0, Math.min(found.length, 12));
  return top[Math.floor(seeded(seed) * top.length)];
}

const need = (a: PackAsset | undefined, what: string): PackAsset => {
  if (!a) throw new Error(`No asset in the game's catalogs for "${what}" (try find_assets with other words)`);
  return a;
};

interface Placing {
  asset: PackAsset;
  /** The middle, pixels. */
  at: [number, number];
  scale: number;
  rotation?: number;
  extra: Record<string, unknown>;
}

/** The document of one placed asset: a picture tile, or a model tile carrying it. */
function placedDoc(b: Builder, p: Placing): Record<string, unknown> {
  const px = b.grid / 5;
  const [w, h] = [p.asset.w * px * p.scale, p.asset.h * px * p.scale];
  const box = { x: p.at[0] - w / 2, y: p.at[1] - h / 2, w, h };
  const name = p.asset.name;
  if (p.asset.kind === 'model') {
    const height = (p.asset.height ?? 0) * p.scale;
    const model = {
      src: p.asset.src,
      ...(height > 0 ? { fill: 'fit', height } : {}),
      ...(p.rotation !== undefined && { rotation: p.rotation }),
    };
    return { name, ...p.extra, kind: 'image', src: '/art/ui/blank.svg', ...box, model };
  }
  const roof = p.asset.overhead && p.extra.overhead === undefined ? { overhead: true } : {};
  return {
    name,
    ...roof,
    ...p.extra,
    kind: 'image',
    src: p.asset.src,
    ...box,
    ...(p.rotation && { rotation: p.rotation }),
  };
}

const PROP_KEYS = ['asset', 'x', 'y', 'kind', 'rotation', 'scale', 'seed', 'id'];

function addProps(b: Builder, bp: Blueprint, find: FindAssets, prefer: Kind): void {
  bp.props.forEach((p, i) => {
    const asset = need(chooseAsset(find, p.asset, p.kind ?? prefer, p.seed ?? i), p.asset);
    const extra = Object.fromEntries(Object.entries(p).filter(([k, v]) => !PROP_KEYS.includes(k) && v !== undefined));
    const doc = placedDoc(b, { asset, at: [b.mid(p.x), b.mid(p.y)], scale: p.scale, rotation: p.rotation, extra });
    b.add('tiles', typeof p.id === 'string' ? p.id : asset.id, doc);
  });
}

type Scatter = Blueprint['scatter'][number];

/** Darts thrown into the area, each kept `spacing` from the others and out of the boxes to avoid. */
function scatterPoints(b: Builder, s: Scatter, size: number): [number, number][] {
  const area = { x: b.len(s.x), y: b.len(s.y), w: b.len(s.w), h: b.len(s.h) };
  const avoid = s.avoid.map((a) => ({ x: b.len(a.x), y: b.len(a.y), w: b.len(a.w), h: b.len(a.h) }));
  const gap = s.spacing !== undefined ? b.len(s.spacing) : size * 0.6;
  const count = s.count ?? Math.max(1, Math.round((area.w * area.h) / (b.grid * b.grid * 8)));
  const points: [number, number][] = [];
  let r = s.seed * 7919;
  const next = () => seeded(r++);
  for (let tries = 0; points.length < count && tries < count * 60; tries++) {
    const p: [number, number] = [area.x + next() * area.w, area.y + next() * area.h];
    if (avoid.some((a) => p[0] >= a.x && p[0] <= a.x + a.w && p[1] >= a.y && p[1] <= a.y + a.h)) continue;
    if (points.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < gap)) continue;
    points.push(p);
  }
  return points;
}

function addScatter(b: Builder, bp: Blueprint, find: FindAssets, prefer: Kind): void {
  for (const s of bp.scatter) {
    // Without a size limit, nothing wider than half the area's long side (a whole set of stones, a grove in one picture).
    const maxFeet = s.maxFeet ?? (Math.max(s.w, s.h) * 5) / 2;
    const sized = (a: PackAsset) => Math.max(a.w, a.h) < (s.minFeet ?? 0) || Math.max(a.w, a.h) > maxFeet;
    const kindOf = s.kind ?? prefer;
    const pool = s.assets.map((what) => {
      const found = find({ search: what, kind: kindOf });
      const list = (found.length ? found : find({ search: what, kind: kindOf === 'tile' ? 'model' : 'tile' })).filter(
        (a) => !sized(a),
      );
      if (!list.length) need(undefined, what);
      return list.slice(0, 12);
    });
    const typical = pool.flat().reduce((sum, a) => sum + Math.max(a.w, a.h), 0) / pool.flat().length;
    const points = scatterPoints(b, s, (typical * b.grid) / 5);
    const extra = { ...(s.level && { level: s.level }), ...(s.levels && { levels: s.levels }) };
    points.forEach((at, i) => {
      const r = s.seed * 104729 + i * 31;
      const list = pool[i % pool.length]!;
      const asset = list[Math.floor(seeded(r) * list.length)]!;
      const scale = s.scale[0] + seeded(r + 1) * (s.scale[1] - s.scale[0]);
      const rotation = s.turn ? Math.round(seeded(r + 2) * 360) : undefined;
      b.add('tiles', asset.id, placedDoc(b, { asset, at, scale, rotation, extra }), true);
    });
  }
}

/** A rect tile's look in a catalog texture: the texture repeated at its own size. */
export function patternLook(asset: PackAsset, repeat?: number, tint?: string): Record<string, unknown> {
  return { pattern: asset.src, textureScale: repeat ?? Math.round((asset.w / 5) * 10) / 10, color: tint ?? '#ffffff' };
}

function addGrounds(b: Builder, bp: Blueprint, find: FindAssets): void {
  bp.grounds.forEach((g, i) => {
    const asset = need(chooseAsset(find, g.texture, 'texture', g.seed ?? i), g.texture);
    const box = { x: b.len(g.x), y: b.len(g.y), w: b.len(g.w), h: b.len(g.h) };
    const floor = { ...(g.level && { level: g.level }), ...(g.levels && { levels: g.levels }) };
    const doc = {
      kind: 'rect',
      name: asset.name,
      ...box,
      ...patternLook(asset, g.repeat, g.tint),
      edge: g.edge,
      ...floor,
    };
    b.add('tiles', `${asset.id}-ground`, doc, true);
  });
}

const NO_CATALOG = 'This game has no asset catalog: turn on a pack with one (a Baileywiki pack)';

/** Grounds from the context's catalogs, laid first so everything stands on them. */
export function addCatalogGrounds(b: Builder, bp: Blueprint, find: FindAssets | undefined): void {
  if (!bp.grounds.length) return;
  if (!find) throw new Error(NO_CATALOG);
  addGrounds(b, bp, find);
}

/** Scatter, then props, from the context's catalogs. */
export function addCatalogPieces(b: Builder, bp: Blueprint, find: FindAssets | undefined, prefer: Kind): void {
  if (!bp.props.length && !bp.scatter.length) return;
  if (!find) throw new Error(NO_CATALOG);
  addScatter(b, bp, find, prefer);
  addProps(b, bp, find, prefer);
}
