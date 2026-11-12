import type { PlacedLight, Prefab, PrefabVary, Tile } from '@vtt/shared';
import type { FoundryDoc } from './foundry-db.ts';
import { propsOf } from './foundry-props.ts';
import { foundryScene, type MediaLookup } from './foundry-scene.ts';

// Baileywiki's prefabs are Mass Edit presets: journal entries whose
// flags['multi-token-edit'].preset names a document type and holds the
// documents to spawn (`data`), what comes with them (`attached`: walls,
// lights, sounds), how each spawn varies (`randomize`) and whether it
// spawns one of them at random (`spawnRandom`, Baileywiki's "brushes").
// 3D prefabs are Token Attacher tokens: a handle token whose
// `prototypeAttached` holds the model tiles and walls. Each becomes one of
// our prefabs (shared/prefabs.ts), converted as a small Foundry scene so
// tiles, models, walls, lights and sounds go through the scene import.

const obj = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const list = (x: unknown) => (Array.isArray(x) ? (x as FoundryDoc[]) : []);
const text = (x: unknown) => (typeof x === 'string' && x ? x : undefined);
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

export interface Preset {
  id: string;
  name: string;
  /** Tile, Token, Wall, AmbientLight, AmbientSound; FauxScene is a scene browser entry. */
  documentName: string;
  data: FoundryDoc[];
  attached: { documentName: string; data: FoundryDoc }[];
  randomize: [string, Record<string, unknown>][];
  img?: string;
  tags: string[];
  gridSize?: number;
  spawnRandom?: boolean;
  postSpawnScript?: string;
  /** The Foundry version that saved it: from v14 tiles stand by their anchor. */
  coreVersion?: string;
}

/** The Mass Edit preset a journal entry holds, if any. */
export function presetOf(entry: FoundryDoc): Preset | undefined {
  const raw = obj(obj(obj(entry.flags)['multi-token-edit']).preset);
  const name = text(raw.name);
  const documentName = text(raw.documentName);
  if (!name || !documentName) return undefined;
  return {
    id: text(raw.id) ?? text(entry._id) ?? name,
    name,
    documentName,
    data: list(raw.data),
    attached: list(raw.attached).map((a) => ({ documentName: text(a.documentName) ?? '', data: obj(a.data) })),
    randomize: (Array.isArray(raw.randomize) ? raw.randomize : []).filter(
      (r): r is [string, Record<string, unknown>] => Array.isArray(r) && typeof r[0] === 'string',
    ),
    ...(text(raw.img) ? { img: text(raw.img) } : {}),
    tags: (Array.isArray(raw.tags) ? raw.tags : []).filter((t): t is string => typeof t === 'string'),
    ...(num(raw.gridSize) ? { gridSize: num(raw.gridSize) } : {}),
    ...(raw.spawnRandom === true ? { spawnRandom: true } : {}),
    ...(text(raw.postSpawnScript) ? { postSpawnScript: text(raw.postSpawnScript) } : {}),
    ...(text(obj(entry._stats).coreVersion) ? { coreVersion: text(obj(entry._stats).coreVersion) } : {}),
  };
}

/** The Foundry scene lists each document type goes in. */
const LISTS: Record<string, string> = {
  Tile: 'tiles',
  Wall: 'walls',
  AmbientLight: 'lights',
  AmbientSound: 'sounds',
  Drawing: 'drawings',
  Note: 'notes',
  Token: 'tokens',
};

type Lists = Record<string, FoundryDoc[]>;

function push(lists: Lists, documentName: string, docs: FoundryDoc[]): void {
  const key = LISTS[documentName];
  if (key) lists[key] = [...(lists[key] ?? []), ...docs];
}

/** A token's Token Attacher attachments, by document type. */
const attachedTo = (token: FoundryDoc) => obj(obj(obj(token.flags)['token-attacher']).prototypeAttached);

/** Everything the preset spawns, by Foundry scene list; handle tokens give way to their attachments. */
function listsOf(p: Preset): Lists {
  const lists: Lists = {};
  for (const doc of p.data) {
    const attached = Object.entries(attachedTo(doc));
    if (p.documentName === 'Token' && attached.length) {
      for (const [type, docs] of attached) push(lists, type, list(docs));
    } else push(lists, p.documentName, [doc]);
  }
  for (const a of p.attached) push(lists, a.documentName, [a.data]);
  return lists;
}

/** Fill the scene: Baileywiki's overlays stretch themselves over it after they spawn. */
const fillsScene = (p: Preset) => /canvas\.dimensions\.scene(Width|Height)/.test(p.postSpawnScript ?? '');

const range = (spec: Record<string, unknown>): [number, number] | undefined => {
  const [min, max] = [num(spec.min), num(spec.max)];
  return min === undefined || max === undefined ? undefined : [Math.min(min, max), Math.max(min, max)];
};

const colours = (spec: Record<string, unknown>) =>
  list(spec.colors).flatMap((c) => (text(c.hex) ? [text(c.hex)!] : []));

const pictures = (spec: Record<string, unknown>, media: MediaLookup) =>
  (Array.isArray(spec.images) ? spec.images : []).flatMap((i) => {
    const found = typeof i === 'string' ? media(i) : undefined;
    return found ? [found] : [];
  });

/** One randomised field as what it varies in a placing, if we keep it. */
function varied(field: string, spec: Record<string, unknown>, media: MediaLookup): PrefabVary {
  const r = range(spec);
  if (r && (field === 'massedit.scale' || field === 'massedit.texture.scale')) return { scale: r };
  if (r && field === 'rotation') return { rotation: r };
  if (/tint$/i.test(field) && colours(spec).length) return { tint: colours(spec) };
  if (field === 'texture.src' && spec.type === 'image' && pictures(spec, media).length)
    return { pictures: pictures(spec, media) };
  return {};
}

/** What we keep of Mass Edit's randomiser: size, turn, tint and picture. */
function varyOf(p: Preset, media: MediaLookup): PrefabVary | undefined {
  const kept = p.randomize.reduce<PrefabVary>((v, [field, spec]) => ({ ...v, ...varied(field, spec, media) }), {});
  return Object.keys(kept).length ? kept : undefined;
}

const GRID = 100;

/** The tiles and lights scenery tokens become, with ids. */
function tokenProps(tokens: FoundryDoc[], media: MediaLookup, grid: number) {
  const { tiles, lights } = propsOf(tokens, { grid, media, feet: (u) => u });
  return {
    tiles: tiles.map((t, i) => ({ ...t, id: `prop-${i + 1}` }) as Tile),
    lights: lights.map((l, i): PlacedLight => ({ ...l, id: `prop-light-${i + 1}` })),
  };
}

/** One preset as a prefab (without its id); undefined when nothing in it can be placed. */
export function prefabOf(p: Preset, media: MediaLookup, gridSize = p.gridSize ?? GRID): Omit<Prefab, 'id'> | undefined {
  const lists = listsOf(p);
  const fake = {
    name: p.name,
    width: 1,
    height: 1,
    padding: 0,
    grid: { size: gridSize, type: 1, distance: 5 },
    ...lists,
    tokens: [],
    ...(p.coreVersion ? { _stats: { coreVersion: p.coreVersion } } : {}),
  };
  const { scene } = foundryScene(fake, media);
  const props = tokenProps(lists.tokens ?? [], media, gridSize);
  const prefab = {
    name: p.name,
    ...(p.tags.length ? { tags: p.tags } : {}),
    ...(p.img && media(p.img) ? { thumb: media(p.img) } : {}),
    tiles: [...scene.tiles, ...props.tiles],
    walls: scene.walls,
    lights: [...scene.lights, ...props.lights],
    sounds: scene.sounds,
    drawings: scene.drawings,
    notes: scene.notes,
    ...(p.spawnRandom ? { pick: 'one' as const } : {}),
    ...(varyOf(p, media) ? { vary: varyOf(p, media) } : {}),
    ...(fillsScene(p) ? { fill: true } : {}),
  };
  const things = prefab.tiles.length + prefab.walls.length + prefab.lights.length + prefab.sounds.length;
  return things + prefab.drawings.length + prefab.notes.length > 0 ? prefab : undefined;
}
