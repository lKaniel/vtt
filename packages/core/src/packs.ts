import { z } from 'zod';

// Asset packs: content and media a game can use without owning it. A pack
// is a folder (data/packs/<id>/) with a pack.json manifest, compendia
// (documents ready to copy into a game, or rules content its system reads)
// and a media folder of pictures, sounds and videos. A system ships packs of
// its own (D&D: the SRD); the rest are installed per server, by hand or by
// the Foundry import, and each game turns on the ones it uses (game.json
// `packs`). Files in a pack are named `pack://<pack>/<path>`, so a game
// says which pack a picture comes from wherever it is played.

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');

/** A path inside the pack: relative, forward slashes, never climbing out of it. */
const innerPath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/') && !p.includes('\\') && !p.split('/').includes('..'), 'a path inside the pack');

export const CompendiumInfoSchema = z.object({
  id: slug,
  name: z.string().optional(),
  /** What its documents are: "scene" and "actor" go into a game; a system adds its own (D&D: monster, item, spell). */
  type: z.string().min(1),
  /** A JSON file holding an array of documents. */
  path: innerPath,
  /** The rules edition its documents are for; missing = every edition. */
  rules: z.string().optional(),
});
export type CompendiumInfo = z.infer<typeof CompendiumInfoSchema>;

/** pack.json */
export const PackManifestSchema = z.object({
  id: slug,
  name: z.string().min(1),
  version: z.string().default('1.0.0'),
  /** The system it is for; null = any (maps, tiles, sounds). */
  system: z.string().nullable().default(null),
  description: z.string().optional(),
  author: z.string().optional(),
  /** "CC-BY-4.0", "private"... Only CC-BY SRD content ships with the code. */
  license: z.string().optional(),
  compendia: z.array(CompendiumInfoSchema).default([]),
  /** The folder of its media, inside the pack. */
  media: innerPath.default('media/'),
  /** Where it came from, e.g. "foundry:module". */
  source: z.string().optional(),
});
export type PackManifest = z.infer<typeof PackManifestSchema>;

/** A pack as the GM's Packs list shows it. */
export interface PackInfo extends PackManifest {
  /** Shipped with the system: always on in its games. */
  builtin?: boolean;
  /** This game uses it. */
  enabled: boolean;
}

/** One compendium's documents, loaded. */
export interface PackCompendium extends CompendiumInfo {
  pack: string;
  docs: unknown[];
}

const SCHEME = 'pack://';

/** `pack://<pack>/<path>` */
export function packRef(pack: string, path: string): string {
  return `${SCHEME}${pack}/${path}`;
}

/** The pack and path a `pack://` reference names; undefined for anything else. */
export function parsePackRef(src: string): { pack: string; path: string } | undefined {
  if (!src.startsWith(SCHEME)) return undefined;
  const rest = src.slice(SCHEME.length);
  const slash = rest.indexOf('/');
  const pack = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (slash < 0 || !slug.safeParse(pack).success || !innerPath.safeParse(path).success) return undefined;
  return { pack, path };
}

/** Where the server serves a pack file: /packs/<pack>/<path>. */
export function packUrl(src: string): string | undefined {
  const ref = parsePackRef(src);
  return ref && `/packs/${ref.pack}/${ref.path.split('/').map(encodeURIComponent).join('/')}`;
}

export type MediaKind = 'image' | 'audio' | 'video';

const KINDS: Record<string, MediaKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  svg: 'image',
  avif: 'image',
  mp3: 'audio',
  ogg: 'audio',
  oga: 'audio',
  wav: 'audio',
  flac: 'audio',
  m4a: 'audio',
  opus: 'audio',
  webm: 'video',
  mp4: 'video',
  m4v: 'video',
};

/** What a file is by its extension, or undefined if it isn't media. */
export function mediaKind(path: string): MediaKind | undefined {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? undefined : KINDS[path.slice(dot + 1).toLowerCase()];
}

/** Search tags for a file from the folders it sits in (inside the media folder). */
export function mediaTags(path: string): string[] {
  return path
    .split('/')
    .slice(0, -1)
    .map((dir) => dir.replace(/[_-]+/g, ' ').trim().toLowerCase())
    .filter(Boolean);
}

/** A picture, sound or video a game can use: from a pack, or the game's own assets. */
export interface MediaEntry {
  /** What a tile or token stores: `pack://...` or `/assets/...`. */
  src: string;
  /** The file name without its extension. */
  name: string;
  kind: MediaKind;
  tags: string[];
  /** The pack it is from; missing = the game's own assets. */
  pack?: string;
}

/** A media entry for a file `path` inside a folder, named by `src`. */
export function mediaEntry(src: string, path: string, pack?: string): MediaEntry | undefined {
  const kind = mediaKind(path);
  if (!kind) return undefined;
  const file = path.split('/').at(-1)!;
  const name = file.slice(0, file.lastIndexOf('.'));
  return { src, name, kind, tags: mediaTags(path), ...(pack ? { pack } : {}) };
}

export interface MediaQuery {
  /** Every word must be in the name or a tag. */
  query?: string;
  tag?: string;
  kind?: MediaKind;
  /** A pack id, or "" for the game's own assets. */
  pack?: string;
}

const matchesFilters = (m: MediaEntry, q: MediaQuery) =>
  (!q.tag || m.tags.includes(q.tag)) &&
  (!q.kind || m.kind === q.kind) &&
  (q.pack === undefined || (m.pack ?? '') === q.pack);

/** The media matching `q`: names that start with the query first, then by name. */
export function searchMedia(media: readonly MediaEntry[], q: MediaQuery): MediaEntry[] {
  const text = (q.query ?? '').trim().toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const rank = (m: MediaEntry) => (m.name.toLowerCase().startsWith(text) ? 0 : 1);
  return media
    .filter((m) => matchesFilters(m, q))
    .filter((m) => words.every((w) => m.name.toLowerCase().includes(w) || m.tags.some((t) => t.includes(w))))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The installed packs a game turned on (game.json `packs`) that fit its system. */
export function enabledPacks<P extends PackManifest>(
  installed: readonly P[],
  ids: readonly string[] | undefined,
  system: string,
): P[] {
  const on = new Set(ids ?? []);
  return installed.filter((p) => on.has(p.id) && (p.system === null || p.system === system));
}

/** The `n` tags most media carry, commonest first (then by name). */
export function topTags(media: readonly MediaEntry[], n: number): string[] {
  const counts = new Map<string, number>();
  for (const m of media) for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([tag]) => tag);
}
