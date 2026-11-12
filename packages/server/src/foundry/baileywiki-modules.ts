import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type CompendiumInfo, freeId, type MediaIndex, slugify } from '@vtt/core';
import type { Prefab, SceneEntry, Tile } from '@vtt/shared';
import { type FoundryDoc, readFoundryDb } from './foundry-db.ts';
import { foundryScene } from './foundry-scene.ts';
import { lossLine } from './import-losses.ts';
import { prefabOf, type Preset, presetOf } from './baileywiki-prefabs.ts';
import { copyModuleMedia, type MediaRun, mediaLookup, readMassEditCache } from './baileywiki-media.ts';
import { mergeBaileywikiManifest } from './baileywiki-pack.ts';
import { readJson, writeJson } from '../store/json-files.ts';

// The Baileywiki modules installed in a Foundry data folder, as the
// `baileywiki` pack (the same pack the online import fills, see
// baileywiki-import.ts): every module's media under media/modules/<id>/,
// the scenes of their compendia with the tags and thumbnails of
// Baileywiki's 2D and 3D scene browsers, their Mass Edit presets as
// prefabs, and Baileywiki's file tags as the pack's media index. The
// scene and prefab compendia are split (an index, then one file per
// document), as there are thousands. Run with `pnpm import-baileywiki`.

const PACK = 'baileywiki';

export interface ModulesOptions {
  /** Module ids to import; default every `baileywiki-*` module in the folder. */
  modules?: string[];
  /** More modules whose files the Baileywiki ones use (canvas3dcompendium for some 3D prefabs). */
  with?: string[];
  /** Hard-link the files instead of copying them (same drive only; falls back to copying). */
  link?: boolean;
  /** Progress lines. */
  log?: (line: string) => void;
}

export interface ModulesReport {
  pack: string;
  dir: string;
  modules: string[];
  media: number;
  copied: number;
  scenes: number;
  prefabs: number;
  skipped: string[];
  /** Every file the scenes and prefabs name that no imported module has (also in the pack's missing-files.txt). */
  missing: string[];
}

interface FoundryPack {
  name: string;
  path: string;
  type: string;
}

interface Module {
  id: string;
  dir: string;
  packs: FoundryPack[];
}

async function readModule(dir: string, id: string): Promise<Module | undefined> {
  const raw = (await readJson(join(dir, 'module.json'))) as { id?: unknown; packs?: unknown } | undefined;
  if (raw?.id !== id) return undefined;
  const packs = (Array.isArray(raw.packs) ? raw.packs : []).flatMap((p: Record<string, unknown>) =>
    typeof p.name === 'string' && typeof p.path === 'string'
      ? [{ name: p.name, path: p.path, type: String(p.type) }]
      : [],
  );
  return { id, dir, packs };
}

/** The modules to import: those named, or every baileywiki-* one. */
async function findModules(modulesDir: string, only?: string[], extra: string[] = []): Promise<Module[]> {
  const all = async () =>
    (await readdir(modulesDir)).filter((n) => n.startsWith('baileywiki-')).sort((a, b) => a.localeCompare(b));
  const names = [...(only ?? (await all())), ...extra];
  const found = await Promise.all(names.map((n) => readModule(join(modulesDir, n), n)));
  return found.filter((m): m is Module => !!m);
}

/** A Foundry document's uuid in a module compendium. */
const uuidOf = (module: string, pack: string, type: string, id: unknown) =>
  `Compendium.${module}.${pack}.${type}.${String(id)}`;

/** One document per Foundry compendium, read once: the scenes and presets both need the journal packs. */
async function packDocs(m: Module, type: string, log?: (l: string) => void): Promise<[FoundryPack, FoundryDoc[]][]> {
  const out: [FoundryPack, FoundryDoc[]][] = [];
  for (const p of m.packs.filter((x) => x.type === type)) {
    log?.(`  reading ${m.id}/${p.name}`);
    out.push([p, await readFoundryDb(join(m.dir, p.path)).catch(() => [])]);
  }
  return out;
}

interface Browser {
  tags: string[];
  thumb?: string;
  /** Which of Baileywiki's scene browsers lists it (me-scenes-2d or me-scenes-3d). */
  view?: '2d' | '3d';
}

/** A Mass Edit preset with the names of its folders and of the compendium it is in. */
interface Found {
  p: Preset;
  folders: string[];
  pack: string;
}

/** The view a Baileywiki scene browser's compendium name gives: me-scenes-3d is 3D. */
const viewOf = (pack: string): Browser['view'] => {
  if (/3d/i.test(pack)) return '3d';
  return /2d/i.test(pack) ? '2d' : undefined;
};

/** What Baileywiki's scene browsers say of each scene (FauxScene presets), by the scene's uuid. */
function sceneBrowser(found: Found[]): Map<string, Browser> {
  const out = new Map<string, Browser>();
  for (const { p, pack } of found.filter((x) => x.p.documentName === 'FauxScene')) {
    const view = viewOf(pack);
    const seen: Browser = { tags: p.tags, ...(p.img ? { thumb: p.img } : {}), ...(view ? { view } : {}) };
    for (const d of p.data) if (typeof d.uuid === 'string') out.set(d.uuid, seen);
  }
  return out;
}

/** The names of a document's folders, outermost first, as tags. */
function folderTags(doc: FoundryDoc, folders: Map<string, FoundryDoc>): string[] {
  const tags: string[] = [];
  let at = typeof doc.folder === 'string' ? folders.get(doc.folder) : undefined;
  for (let i = 0; at && i < 8; i++) {
    if (typeof at.name === 'string') tags.unshift(at.name.toLowerCase());
    at = typeof at.folder === 'string' ? folders.get(at.folder) : undefined;
  }
  return tags;
}

/** Folders are the documents with a `type` and no `pages`. */
const foldersIn = (docs: FoundryDoc[]) =>
  new Map(docs.filter((d) => typeof d.type === 'string' && !('pages' in d)).map((d) => [String(d._id), d]));

/** A compendium written one file per document, with its index. */
class SplitWriter {
  readonly index: { id: string; name: string; thumb?: string; tags?: string[] }[] = [];
  private taken = new Set<string>();

  constructor(
    readonly info: CompendiumInfo,
    private dir: string,
  ) {}

  async start(): Promise<void> {
    await rm(join(this.dir, this.info.path), { recursive: true, force: true });
    await mkdir(join(this.dir, this.info.path), { recursive: true });
  }

  async add(doc: { name: string; thumb?: string; tags?: string[] } & Record<string, unknown>): Promise<string> {
    const id = freeId(slugify(doc.name) || 'entry', (x) => this.taken.has(x), { bare: true });
    this.taken.add(id);
    const { thumb, tags } = doc;
    this.index.push({ id, name: doc.name, ...(thumb ? { thumb } : {}), ...(tags?.length ? { tags } : {}) });
    await writeJson(join(this.dir, this.info.path, `${id}.json`), { id, ...doc });
    return id;
  }

  async finish(): Promise<CompendiumInfo | undefined> {
    await writeJson(join(this.dir, this.info.path, 'index.json'), this.index);
    return this.index.length ? this.info : undefined;
  }
}

/** A scene is 3D when Baileywiki's 3D scene browser lists it, else when 3D Canvas opens it in 3D. */
const scene3d = (scene: Pick<SceneEntry, 'view'>, seen?: Browser) =>
  seen?.view ? seen.view === '3d' : scene.view === '3d';

/** A prefab is 3D when it has a model, or Baileywiki files it among its 3D ones (3DFX particles). */
const prefab3d = (prefab: { tiles: readonly Tile[]; tags?: readonly string[] }) =>
  prefab.tiles.some((t) => t.kind === 'image' && !!t.model) || (prefab.tags ?? []).some((t) => /\b3d\b/i.test(t));

interface Run extends MediaRun {
  log?: (line: string) => void;
  skipped: string[];
  missing: Set<string>;
  browser: Map<string, Browser>;
  out: Record<'scenes2d' | 'scenes3d' | 'prefabs2d' | 'prefabs3d', SplitWriter>;
}

/** Whether a document of a Scene compendium is a scene (and not a folder). */
const isScene = (doc: FoundryDoc) =>
  !!doc.name && ('walls' in doc || 'tiles' in doc || 'background' in doc || 'img' in doc);

/** One Foundry scene into its compendium, with what Baileywiki's scene browser says of it. */
async function importScene(run: Run, doc: FoundryDoc, uuid: string, module: string): Promise<void> {
  const media = mediaLookup(run, run.missing);
  const { scene, skipped } = foundryScene(doc, media);
  if (skipped.length > 3) run.skipped.push(`scene "${scene.name}": ${skipped.map(lossLine).slice(0, 3).join('; ')}…`);
  const seen = run.browser.get(uuid);
  const thumb = (seen?.thumb ? media(seen.thumb) : undefined) ?? scene.thumb;
  const tags = [module.replace(/^baileywiki-/, ''), ...(seen?.tags ?? [])];
  await run.out[scene3d(scene, seen) ? 'scenes3d' : 'scenes2d'].add({ ...scene, tags, ...(thumb ? { thumb } : {}) });
}

async function importScenes(run: Run, m: Module): Promise<number> {
  let n = 0;
  for (const [p, docs] of await packDocs(m, 'Scene', run.log))
    for (const doc of docs.filter(isScene)) {
      await importScene(run, doc, uuidOf(m.id, p.name, 'Scene', doc._id), m.id);
      n++;
    }
  return n;
}

async function importPrefabs(run: Run, presets: Found[]): Promise<number> {
  const media = mediaLookup(run, run.missing);
  let n = 0;
  for (const { p, folders } of presets) {
    const prefab = prefabOf(p, media);
    if (!prefab) continue;
    const tags = [...new Set([...folders, ...(prefab.tags ?? [])])];
    const doc: Omit<Prefab, 'id'> = { ...prefab, ...(tags.length ? { tags } : {}) };
    await run.out[prefab3d(doc) ? 'prefabs3d' : 'prefabs2d'].add(doc);
    n++;
  }
  return n;
}

/** A journal compendium's Mass Edit presets, with their folder names. */
function presetsIn(docs: FoundryDoc[], pack: string): Found[] {
  const folders = foldersIn(docs);
  return docs.flatMap((d): Found[] => {
    const p = presetOf(d);
    return p ? [{ p, folders: folderTags(d, folders), pack }] : [];
  });
}

/** Every Mass Edit preset of the modules' journal compendia, with its folder names. */
async function readPresets(run: Run, modules: Module[]): Promise<Found[]> {
  const out: Found[] = [];
  for (const m of modules)
    for (const [p, docs] of await packDocs(m, 'JournalEntry', run.log)) out.push(...presetsIn(docs, p.name));
  return out;
}

const COMPENDIA: Record<keyof Run['out'], Omit<CompendiumInfo, 'split'>> = {
  scenes2d: { id: 'bw-scenes-2d', name: 'Baileywiki 2D scenes', type: 'scene', path: 'compendia/bw-scenes-2d' },
  scenes3d: { id: 'bw-scenes-3d', name: 'Baileywiki 3D scenes', type: 'scene', path: 'compendia/bw-scenes-3d' },
  prefabs2d: { id: 'bw-prefabs-2d', name: 'Baileywiki 2D prefabs', type: 'prefab', path: 'compendia/bw-prefabs-2d' },
  prefabs3d: { id: 'bw-prefabs-3d', name: 'Baileywiki 3D prefabs', type: 'prefab', path: 'compendia/bw-prefabs-3d' },
};

function writers(dir: string): Run['out'] {
  const out = {} as Run['out'];
  for (const [key, info] of Object.entries(COMPENDIA) as [keyof Run['out'], CompendiumInfo][])
    out[key] = new SplitWriter({ ...info, split: true }, dir);
  return out;
}

/** Missing files, by the module they would come from, as report lines. */
function missingLines(missing: Set<string>): string[] {
  const byModule = new Map<string, number>();
  for (const path of missing) {
    const from = /^modules\/([^/]+)\//.exec(path)?.[1] ?? path.split('/')[0] ?? path;
    byModule.set(from, (byModule.get(from) ?? 0) + 1);
  }
  return [...byModule].map(([from, n]) => `${n} file(s) from ${from} are not in the pack`);
}

/** Imports the Baileywiki modules of a Foundry `modules` folder into the `baileywiki` pack in `packsDir`. */
export async function importBaileywikiModules(
  modulesDir: string,
  packsDir: string,
  opts: ModulesOptions = {},
): Promise<ModulesReport> {
  const modules = await findModules(modulesDir, opts.modules, opts.with);
  if (!modules.length) throw new Error(`No Baileywiki modules (baileywiki-*/module.json) in ${modulesDir}`);
  const dir = join(packsDir, PACK);
  const run: Run = {
    dir,
    pack: PACK,
    link: opts.link,
    have: new Set(),
    copied: 0,
    log: opts.log,
    skipped: [],
    missing: new Set(),
    browser: new Map(),
    out: writers(dir),
  };
  const index: MediaIndex = {};
  let media = 0;
  for (const m of modules) {
    opts.log?.(`copying ${m.id}`);
    media += await copyModuleMedia(run, m.dir, m.id);
    Object.assign(index, await readMassEditCache(m.dir));
  }
  for (const w of Object.values(run.out)) await w.start();
  const presets = await readPresets(run, modules);
  run.browser = sceneBrowser(presets);
  let scenes = 0;
  for (const m of modules) scenes += await importScenes(run, m);
  const prefabs = await importPrefabs(run, presets);
  const compendia = (await Promise.all(Object.values(run.out).map((w) => w.finish()))).filter((c) => !!c);
  await writeJson(join(dir, 'media-index.json'), index);
  await mergeBaileywikiManifest(dir, compendia, { mediaIndex: 'media-index.json' });
  const skipped = [...missingLines(run.missing), ...run.skipped];
  const missing = [...run.missing].sort((a, b) => a.localeCompare(b));
  await writeFile(join(dir, 'missing-files.txt'), missing.map((m) => `${m}\n`).join(''));
  const counts = { media, copied: run.copied, scenes, prefabs };
  return { pack: PACK, dir, modules: modules.map((m) => m.id), ...counts, skipped, missing };
}
