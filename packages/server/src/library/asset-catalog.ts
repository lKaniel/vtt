import { open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type AssetCatalog, type CatalogAsset, mediaKind, slugify, wordsOf } from '@vtt/core';
import { filesUnder } from './pack-store.ts';

// Makes a pack's asset catalog (core/asset-catalog.ts) from its media: each
// picture's size from its header, each glTF model's bounds from its JSON,
// both turned to feet, so Claude's map tools can place a tree, a boulder or
// a house at its real size. Thumbnails become their model's preview and are
// left out; a tileable picture is a texture. Only headers are read, so a
// library of tens of thousands of files is catalogued in a minute.

export interface CatalogOptions {
  /** What goes before each file's path inside the media folder to make its pack path (`media/`). */
  prefix?: string;
  /** Picture pixels per 5 ft square (Baileywiki draws at 150), unless `usage` or the file's name says otherwise. */
  pxPerSquare?: number;
  /**
   * Pixels per square as maps really use them, by file or folder (ending "/") inside the media folder,
   * worked out from existing scenes: a folder's applies to the files in it the maps never used.
   */
  usage?: Record<string, number>;
  /** Feet per model unit (Baileywiki's models: 5). */
  feetPerUnit?: number;
  /** Only files whose path inside the media folder matches. */
  include?: RegExp;
  /** Only these top folders of the media folder are read (a Foundry modules folder: those starting baileywiki-). */
  top?: (folder: string) => boolean;
  /** Tags and previews by pack path (a pack's `media-index.json`). */
  index?: Record<string, { tags?: string[]; thumb?: string }>;
  /** Files read at once. */
  parallel?: number;
  source?: string;
}

export interface Size {
  w: number;
  h: number;
}

const be32 = (b: Buffer, at: number) => (b.length >= at + 4 ? b.readUInt32BE(at) : 0);

function pngSize(b: Buffer): Size | undefined {
  if (b.toString('latin1', 1, 4) !== 'PNG') return undefined;
  return { w: be32(b, 16), h: be32(b, 20) };
}

function webpSize(b: Buffer): Size | undefined {
  if (b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP' || b.length < 30) return undefined;
  const chunk = b.toString('latin1', 12, 16);
  if (chunk === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  return undefined;
}

/** The size in a JPEG's frame header (SOF0–SOF15, but not DHT, JPG or DAC). */
function jpegSize(b: Buffer): Size | undefined {
  if (b[0] !== 0xff || b[1] !== 0xd8) return undefined;
  let at = 2;
  while (at + 9 < b.length && b[at] === 0xff) {
    const marker = b[at + 1]!;
    const sof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (sof) return { w: b.readUInt16BE(at + 7), h: b.readUInt16BE(at + 5) };
    at += 2 + b.readUInt16BE(at + 2);
  }
  return undefined;
}

/** A picture's size from the start of its file; undefined for anything else. */
export function imageSize(b: Buffer): Size | undefined {
  const size = pngSize(b) ?? webpSize(b) ?? jpegSize(b);
  return size && size.w > 0 && size.h > 0 ? size : undefined;
}

type Vec = [number, number, number];
type Mat = number[];
interface GltfNode {
  mesh?: number;
  children?: number[];
  matrix?: Mat;
  translation?: Vec;
  rotation?: [number, number, number, number];
  scale?: Vec;
}
interface Gltf {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives?: { attributes?: { POSITION?: number } }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
}

/** A node's transform, column-major. */
function matOf(n: GltfNode): Mat {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

const mul = (a: Mat, b: Mat): Mat =>
  Array.from({ length: 16 }, (_, i) => {
    const [c, r] = [Math.floor(i / 4), i % 4];
    return [0, 1, 2, 3].reduce((s, k) => s + a[r + 4 * k]! * b[k + 4 * c]!, 0);
  });

const apply = (m: Mat, p: Vec): Vec =>
  [0, 1, 2].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!) as Vec;

const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

class Bounds {
  min: Vec = [Infinity, Infinity, Infinity];
  max: Vec = [-Infinity, -Infinity, -Infinity];

  add(p: Vec): void {
    for (let k = 0; k < 3; k++) {
      this.min[k] = Math.min(this.min[k]!, p[k]!);
      this.max[k] = Math.max(this.max[k]!, p[k]!);
    }
  }

  /** The eight corners of an accessor's box, moved by `m`. */
  addBox(m: Mat, lo: number[], hi: number[]): void {
    for (const x of [lo[0]!, hi[0]!])
      for (const y of [lo[1]!, hi[1]!]) for (const z of [lo[2]!, hi[2]!]) this.add(apply(m, [x, y, z]));
  }
}

function walkNode(g: Gltf, i: number, parent: Mat, box: Bounds, depth = 0): void {
  const n = g.nodes?.[i];
  if (!n || depth > 64) return;
  const m = mul(parent, matOf(n));
  for (const prim of n.mesh === undefined ? [] : (g.meshes?.[n.mesh]?.primitives ?? [])) {
    const acc = g.accessors?.[prim.attributes?.POSITION ?? -1];
    if (acc?.min && acc.max) box.addBox(m, acc.min, acc.max);
  }
  for (const c of n.children ?? []) walkNode(g, c, m, box, depth + 1);
}

/** The JSON of a .glb (its first chunk) or of a .gltf. */
function gltfJson(b: Buffer): Gltf | undefined {
  try {
    if (b.toString('latin1', 0, 4) !== 'glTF') return JSON.parse(b.toString('utf8').replace(/^﻿/, '')) as Gltf;
    const length = b.readUInt32LE(12);
    return JSON.parse(b.toString('utf8', 20, 20 + length)) as Gltf;
  } catch {
    return undefined;
  }
}

/** A glTF model's bounds in its own units, through its scene's nodes; undefined without any. */
export function glbBounds(b: Buffer): { min: Vec; max: Vec } | undefined {
  const g = gltfJson(b);
  if (!g) return undefined;
  const roots = g.scenes?.[g.scene ?? 0]?.nodes ?? (g.nodes ?? []).map((_, i) => i);
  const box = new Bounds();
  for (const i of roots) walkNode(g, i, IDENTITY, box);
  if (!Number.isFinite(box.min[0])) return undefined;
  const round = (v: Vec) => v.map((x) => Math.round(x * 1000) / 1000 + 0) as Vec;
  return { min: round(box.min), max: round(box.max) };
}

/** The start of a file: a picture's header, or the whole JSON chunk of a .glb (a .gltf is read whole). */
async function head(path: string): Promise<Buffer> {
  const f = await open(path, 'r');
  try {
    const first = Buffer.alloc(65536);
    const { bytesRead } = await f.read(first, 0, first.length, 0);
    const b = first.subarray(0, bytesRead);
    if (b.toString('latin1', 0, 4) !== 'glTF' && !path.toLowerCase().endsWith('.gltf')) return b;
    const want = b.toString('latin1', 0, 4) === 'glTF' ? 20 + b.readUInt32LE(12) : (await f.stat()).size;
    if (want <= bytesRead) return b;
    const all = Buffer.alloc(want);
    await f.read(all, 0, want, 0);
    return all;
  } finally {
    await f.close();
  }
}

/** Folders and names that are never map pieces. */
const SKIP =
  /(^|\/)(thumbs?|thumbnails?|icons?|tokens?|fonts|banners|reference|logos?|bw-logos|scripts|lang|height-?maps?[^/]*)(\/|$)|_thumb\.|-thumb\.|thumbnail/i;
/** Folders of pictures that are not seen from above: model textures, illustrations, side-on scenery. */
const NOT_MAP = /(^|\/)(models|artwork|scenescapes?|scenescape-demo|prefab-icons)(\/|$)/i;
/** File names of a material's extra maps and masks, not pictures to draw. */
const NOT_PICTURE =
  /(^|[._-])(normal(gl|dx)?|roughness|displacement|metal(lic|ness)?|ao|opacity|specular|splatmap|heightmap|icon|greyscale)([._-]|$)|[._-](n|r|m|o|h|orm)\.[a-z0-9]+$/i;
const TEXTURE = /tileable|seamless|pattern|unlimited|infinite|splatmap|(^|\/)textures\//i;
const OVERHEAD = /tree|canop|roof|awning|overhang/i;

const feet = (v: number) => Math.round(v * 10) / 10;
const noExt = (p: string) => p.replace(/\.[^./]+$/, '');

interface Found {
  rel: string;
  kind: 'image' | 'model';
}

/** The files worth cataloguing: pictures and models outside the skipped folders. */
function candidates(files: string[], include?: RegExp): Found[] {
  return files.flatMap((rel): Found[] => {
    const kind = mediaKind(rel);
    if ((kind !== 'image' && kind !== 'model') || SKIP.test(rel) || (include && !include.test(rel))) return [];
    if (kind === 'image' && (NOT_MAP.test(rel) || NOT_PICTURE.test(rel.split('/').at(-1)!))) return [];
    if (rel.toLowerCase().endsWith('.svg')) return [];
    return [{ rel, kind }];
  });
}

/** A free id for a file: its name, then with its folder, then numbered. */
function idFor(rel: string, taken: Set<string>): string {
  const parts = noExt(rel).split('/');
  const name = slugify(parts.at(-1)!) || 'asset';
  const folder = slugify(parts.at(-2) ?? '');
  let id = name;
  if (taken.has(id) && folder) id = `${folder}-${name}`;
  for (let n = 2; taken.has(id); n++) id = `${folder ? `${folder}-` : ''}${name}-${n}`;
  taken.add(id);
  return id;
}

interface Measured extends Found {
  size?: Size;
  height?: number;
}

type Scale = Required<Pick<CatalogOptions, 'pxPerSquare' | 'feetPerUnit'>> & Pick<CatalogOptions, 'usage'>;

/** The picture's pixels per square: as scenes use it or its folder, then a "200dpi" in its name, then the default. */
export function pxPerSquareOf(rel: string, o: Pick<Scale, 'pxPerSquare' | 'usage'>): number {
  const paths = [rel, rel.replace(/^modules\//, '')];
  for (const p of paths) {
    const parts = p.split('/');
    for (let n = parts.length; n > 0; n--) {
      const key = n === parts.length ? p : `${parts.slice(0, n).join('/')}/`;
      const used = o.usage?.[key];
      if (used && used > 0) return used;
    }
  }
  const dpi = /(\d{2,3})dpi/i.exec(rel.split('/').at(-1)!);
  return dpi ? Number(dpi[1]) : o.pxPerSquare;
}

async function measure(root: string, f: Found, o: Scale) {
  const b = await head(join(root, f.rel)).catch(() => undefined);
  if (!b) return { ...f };
  if (f.kind === 'image') {
    const px = imageSize(b);
    const per = pxPerSquareOf(f.rel, o);
    return { ...f, size: px && { w: feet((px.w / per) * 5), h: feet((px.h / per) * 5) } };
  }
  const box = glbBounds(b);
  if (!box) return { ...f };
  const span = (k: number) => feet((box.max[k]! - box.min[k]!) * o.feetPerUnit);
  return { ...f, size: { w: span(0), h: span(2) }, height: span(1) };
}

async function measureAll(root: string, found: Found[], o: CatalogOptions): Promise<Measured[]> {
  const opts = { pxPerSquare: o.pxPerSquare ?? 150, feetPerUnit: o.feetPerUnit ?? 5, usage: o.usage };
  const out: Measured[] = new Array(found.length);
  let next = 0;
  const worker = async () => {
    while (next < found.length) {
      const i = next++;
      out[i] = await measure(root, found[i]!, opts);
    }
  };
  await Promise.all(Array.from({ length: o.parallel ?? 32 }, worker));
  return out;
}

function assetOf(m: Measured, path: string, id: string, thumb: string | undefined, o: CatalogOptions): CatalogAsset {
  const extra = o.index?.[path] ?? o.index?.[path.replace(/^media\//, '')];
  const tags = [...new Set([...wordsOf(m.rel), ...(extra?.tags ?? []).flatMap((t) => wordsOf(t))])];
  const kind = m.kind === 'model' ? 'model' : TEXTURE.test(m.rel) ? 'texture' : 'tile';
  const name = noExt(m.rel.split('/').at(-1)!).replace(/[_-]+/g, ' ');
  const preview = thumb ?? extra?.thumb;
  return {
    id,
    src: path,
    kind,
    name,
    tags,
    w: Math.max(m.size!.w, 0.1),
    h: Math.max(m.size!.h, 0.1),
    ...(m.height !== undefined && { height: m.height }),
    ...(preview && { thumb: preview.startsWith(o.prefix ?? '') ? preview : `${o.prefix ?? ''}${preview}` }),
    ...(kind === 'tile' && OVERHEAD.test(m.rel) && { overhead: true }),
  };
}

/** Every file under `root`, or under its top folders that `top` keeps. */
async function filesIn(root: string, top?: (folder: string) => boolean): Promise<string[]> {
  if (!top) return filesUnder(root);
  const entries = await readdir(root, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory() && top(e.name)).map((e) => e.name);
  const lists = await Promise.all(folders.sort().map((f) => filesUnder(root, f)));
  return lists.flat();
}

/** The catalog of the pictures and models under `root` (a pack's media folder). */
export async function buildCatalog(root: string, o: CatalogOptions = {}): Promise<AssetCatalog> {
  const prefix = o.prefix ?? '';
  const files = await filesIn(root, o.top);
  // A picture beside a model of the same name is its preview, not a tile.
  const models = new Set(files.filter((f) => mediaKind(f) === 'model').map(noExt));
  const thumbOf = new Map<string, string>();
  const pictures = files.filter((f) => {
    if (mediaKind(f) !== 'image' || !models.has(noExt(f))) return true;
    thumbOf.set(noExt(f), `${prefix}${f}`);
    return false;
  });
  const measured = await measureAll(root, candidates(pictures, o.include), o);
  const taken = new Set<string>();
  const seen = new Set<string>();
  const assets = measured.flatMap((m) => {
    if (!m.size || m.size.w <= 0 || m.size.h <= 0) return [];
    // Baileywiki ships the same file in its free and premium modules: keep the first.
    const same = `${m.rel.split('/').at(-1)!.toLowerCase()}|${m.size.w}|${m.size.h}|${m.height ?? ''}`;
    if (seen.has(same)) return [];
    seen.add(same);
    return [assetOf(m, `${prefix}${m.rel}`, idFor(m.rel, taken), thumbOf.get(noExt(m.rel)), o)];
  });
  return { format: 1, ...(o.source && { source: o.source }), assets };
}
