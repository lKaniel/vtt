import { type Doc, type Op, seeded } from '@vtt/core';
import { pasteAt, type Player, type Prefab, prefabClip, PrefabSchema } from '@vtt/shared';
import { z } from 'zod';
import type { Game } from '../game.ts';
import type { McpTool } from './mcp-protocol.ts';
import { ask } from './mcp-seat.ts';
import type { BridgeTable } from './mcp-tools.ts';

// Whole prefabs for Claude's maps: a Baileywiki house is its floor, its
// walls, doors and windows, its lamps and its roof (an overhead tile)
// together, a Mass Edit preset imported as a prefab. These find them in
// the prefab compendia of the game's packs, as the GM's library lists
// them, and turn a build's `prefabs` into the documents a drop from the
// library would make, so a map's buildings come walled and roofed.

interface Table {
  game: Game;
  player: Player;
}

const StubSchema = z.object({ id: z.string(), name: z.string(), tags: z.array(z.string()).default([]) });
type Stub = z.infer<typeof StubSchema>;

/** A prefab compendium of a pack the game uses, with what it lists. */
interface Shelf {
  pack: string;
  compendium: string;
  stubs: Stub[];
}

async function shelves({ game, player }: Table): Promise<Shelf[]> {
  const { packs } = await ask(game, player, { t: 'packs' }, 'packs');
  const named = packs
    .filter((p) => p.enabled)
    .flatMap((p) => p.compendia.filter((c) => c.type === 'prefab').map((c) => ({ pack: p.id, compendium: c.id })));
  return Promise.all(
    named.map(async (n) => {
      const { docs } = await ask(game, player, { t: 'compendium', ...n }, 'compendium');
      return { ...n, stubs: docs.flatMap((d) => StubSchema.safeParse(d).data ?? []) };
    }),
  );
}

async function whole({ game, player }: Table, at: { pack: string; compendium: string; id: string }): Promise<Prefab> {
  const { doc } = await ask(game, player, { t: 'compendiumDoc', ...at }, 'compendiumDoc');
  const parsed = PrefabSchema.safeParse(doc);
  if (!parsed.success) throw new Error(`Prefab "${at.id}" can't be placed: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

const FindSchema = z.object({
  game: z.string().optional().describe('The game id (from list_games); leave out for your default game.'),
  search: z.string().min(1).max(200).describe('Words that must all be in its name or tags ("barn", "tavern roof")'),
  compendium: z.string().max(80).optional().describe('Only this compendium (bw-prefabs-2d, bw-prefabs-3d)'),
  limit: z.number().int().min(1).max(200).default(12),
  details: z
    .boolean()
    .default(true)
    .describe('Open each one for its size and what it holds; false lists only ids, names and tags (for long lists)'),
});
type Find = z.infer<typeof FindSchema>;

interface Hit extends Stub {
  pack: string;
  compendium: string;
  score: number;
}

/** How well a listed prefab answers the words: 0 when one is missing; words in its name count most. */
function scoreOf(s: Stub, words: readonly string[]): number {
  const name = `${s.id} ${s.name}`.toLowerCase();
  const tags = s.tags.join(' ').toLowerCase();
  if (!words.every((w) => name.includes(w) || tags.includes(w))) return 0;
  return 1 + words.filter((w) => name.includes(w)).length;
}

function hits(found: readonly Shelf[], a: Pick<Find, 'search' | 'compendium'>): Hit[] {
  const words = a.search.toLowerCase().split(/\s+/).filter(Boolean);
  const all = found
    .filter((s) => !a.compendium || s.compendium === a.compendium)
    .flatMap((s) => s.stubs.map((stub) => ({ ...stub, pack: s.pack, compendium: s.compendium })));
  const exact = all.filter((s) => s.id === a.search);
  if (exact.length) return exact.map((s) => ({ ...s, score: 9 }));
  return all
    .map((s) => ({ ...s, score: scoreOf(s, words) }))
    .filter((s) => s.score > 0)
    .toSorted((x, y) => y.score - x.score || x.name.length - y.name.length);
}

const round = (v: number) => Math.round(v * 10) / 10;
const count = <T>(list: readonly T[], is: (t: T) => unknown) => list.filter(is).length || undefined;

/** The file names of its pictures and models, without folders: what it is made of at a glance. */
function pictures(p: Prefab): string[] {
  const files = p.tiles.flatMap((t) => (t.kind === 'image' ? [t.model?.src ?? t.src] : []));
  const names = files.map((f) => decodeURIComponent(f.slice(f.lastIndexOf('/') + 1)).replace(/\.\w+$/, ''));
  return [...new Set(names)].slice(0, 8);
}

/** Squares across and down: of everything, or of the first tile of a brush that places one. */
function squares(p: Prefab): [number, number] | undefined {
  const boxes = p.tiles.flatMap((t) => (t.kind === 'group' ? [] : [t]));
  const used = p.pick === 'one' ? boxes.slice(0, 1) : boxes;
  if (!used.length) return undefined;
  const grid = p.grid ?? 100;
  const w = Math.max(...used.map((b) => b.x + b.w)) - Math.min(...used.map((b) => b.x));
  const h = Math.max(...used.map((b) => b.y + b.h)) - Math.min(...used.map((b) => b.y));
  return [round(w / grid), round(h / grid)];
}

/** A prefab as Claude needs it to choose one: how big, and whether it brings walls, doors, windows, a roof. */
function brief(p: Prefab) {
  const levels = [...new Set(p.tiles.flatMap((t) => ('level' in t && t.level ? [t.level] : [])))];
  return {
    squares: squares(p),
    tiles: p.tiles.filter((t) => t.kind !== 'group').length,
    roofs: count(p.tiles, (t) => t.kind === 'image' && t.overhead),
    models: count(p.tiles, (t) => t.kind === 'image' && t.model),
    walls: p.walls.length || undefined,
    doors: count(p.walls, (w) => w.door),
    windows: count(p.walls, (w) => !w.door && w.sight === 'none' && w.move !== 'none'),
    lights: p.lights.length || undefined,
    sounds: p.sounds.length || undefined,
    ...(levels.length && { levels }),
    ...(p.pick === 'one' && { brush: 'each placing puts down one of its tiles' }),
    ...(p.fill && { fill: true }),
    pictures: pictures(p),
  };
}

function findPrefabsTool(table: BridgeTable): McpTool {
  return {
    name: 'find_prefabs',
    description:
      'Whole prefabs in the game’s packs (GM), best first: a Baileywiki building with its floor, walls, doors, ' +
      'windows, lights and overhead roof as one, furniture sets, terrain. Each says its size in 5 ft squares ' +
      'and what it brings (roofs, walls, doors, windows). Place them by id with build_scene `prefabs`: a ' +
      'building should be a prefab with walls and a roof, never a lone floor picture.',
    input: FindSchema,
    run: async (a: Find) => {
      const seat = await table.seat(a.game);
      const found = hits(await shelves(seat), a);
      if (!found.length) return JSON.stringify({ total: 0, note: 'Nothing: try fewer or other words' });
      const shown = found.slice(0, a.limit).map(({ score: _, ...h }) => ({ ...h, tags: h.tags.slice(0, 10) }));
      const opened = a.details ? await Promise.all(shown.map((h) => whole(seat, h))) : [];
      const prefabs = shown.map((h, i) => ({ ...h, ...(opened[i] && brief(opened[i])) }));
      return JSON.stringify({ total: found.length, prefabs });
    },
  };
}

export const PrefabPlacingSchema = z.object({
  prefab: z.string().min(1).max(120).describe('Its id (find_prefabs)'),
  compendium: z.string().max(80).optional().describe('Its compendium, when two have the id'),
  x: z.number().describe('Where its middle goes: squares along grid lines (10 = the line 10 squares in), or pixels'),
  y: z.number(),
  rotation: z.number().optional().describe('Degrees clockwise'),
  scale: z.number().positive().max(20).optional().describe('Times its size; left out, its own size in squares'),
  seed: z.number().int().optional().describe('For a prefab that varies: the same seed places the same'),
});
export type PrefabPlacing = z.infer<typeof PrefabPlacingSchema>;

interface Source {
  all(coll: string): Doc[];
  get(coll: string, id: string): Doc | undefined;
}

export interface PrefabSite {
  scene: string;
  /** Pixels per square, and whether the placings count in squares. */
  grid: number;
  squares: boolean;
  /** What the scene holds, for free ids. */
  docs: Source;
}

/** A source that also knows what this build has made so far, so two prefabs never share an id. */
function growing(docs: Source) {
  const made = new Map<string, Doc>();
  const src: Source = {
    all: (coll) => docs.all(coll),
    get: (coll, id) => docs.get(coll, id) ?? made.get(`${coll}/${id}`),
  };
  const keep = (ops: readonly Op[]) => {
    for (const op of ops) if (op.op === 'create') made.set(`${op.coll}/${op.doc.id}`, op.doc);
  };
  return { src, keep, has: (coll: string, id: string) => made.has(`${coll}/${id}`) };
}

/**
 * The documents a build's `prefabs` make, as a drop from the library would,
 * each sized to the scene's squares with its middle on its point; `has`
 * tells which ids they took.
 */
export async function prefabOps(
  seat: Table,
  placings: readonly PrefabPlacing[],
  site: PrefabSite,
): Promise<{ ops: Op[]; has: (coll: string, id: string) => boolean }> {
  const taken = growing(site.docs);
  const ops: Op[] = [];
  const found = placings.length ? await shelves(seat) : [];
  const k = site.squares ? site.grid : 1;
  for (const [i, p] of placings.entries()) {
    const hit = hits(found, { search: p.prefab, compendium: p.compendium }).find((h) => h.id === p.prefab);
    if (!hit) throw new Error(`No prefab "${p.prefab}" in the game's packs (find_prefabs lists them)`);
    let roll = (p.seed ?? i + 1) * 1000;
    const clip = prefabClip(await whole(seat, hit), {
      random: () => seeded(roll++),
      grid: site.grid,
      at: [p.x * k, p.y * k],
      ...(p.rotation !== undefined && { turn: p.rotation }),
      ...(p.scale !== undefined && { scale: p.scale }),
    });
    const pasted = pasteAt(taken.src, clip, { scene: site.scene, offset: [0, 0] });
    taken.keep(pasted.ops);
    ops.push(...pasted.ops);
  }
  return { ops, has: taken.has };
}

export function prefabTools(table: BridgeTable): McpTool[] {
  return [findPrefabsTool(table)];
}
