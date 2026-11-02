import { freeId, slugify } from '@vtt/core';
import type { Journal, JournalPage, Playlist, RollTable, Track } from '@vtt/shared';
import { z } from 'zod';
import type { MediaLookup } from './foundry-scene.ts';

// The journal entries, roll tables and playlists of a Foundry module or
// world, as our sidebar documents. Journal ids are kept in a lookup so the
// scenes' map notes can point at the entries brought with them.

const str = z.string().optional().catch(undefined).nullable();
const num = z.number().optional().catch(undefined);

const FoundryPage = z.object({
  _id: str,
  name: z.string().catch('Page'),
  type: z.string().catch('text'),
  text: z.object({ content: str }).optional().catch(undefined),
  src: str,
});

const FoundryJournal = z.object({
  _id: str,
  folder: str,
  name: z.string().min(1),
  pages: z.array(z.unknown()).optional().catch(undefined),
  /** v9: one page of HTML. */
  content: str,
});

const FoundryTable = z.object({
  name: z.string().min(1),
  folder: str,
  description: str,
  replacement: z.boolean().optional().catch(undefined),
  results: z
    .array(
      z.object({
        text: z.string().catch(''),
        weight: num,
        range: z.tuple([z.number(), z.number()]).optional().catch(undefined),
        drawn: z.boolean().optional().catch(undefined),
      }),
    )
    .catch([]),
});

const FoundryPlaylist = z.object({
  _id: str,
  name: z.string().min(1),
  folder: str,
  mode: num,
  sounds: z
    .array(
      z.object({
        name: z.string().catch('Track'),
        path: str,
        volume: num,
        repeat: z.boolean().optional().catch(undefined),
      }),
    )
    .catch([]),
});

export interface RawEntries {
  journals?: unknown[];
  tables?: unknown[];
  playlists?: unknown[];
}

export interface ConvertedEntries {
  journals: Journal[];
  tables: RollTable[];
  playlists: Playlist[];
  /** Our entry id for a Foundry journal entry id. */
  entries: (foundryId: string) => string | undefined;
  /** Our page id for a Foundry page id. */
  pages: (foundryId: string) => string | undefined;
  /** Our playlist id for a Foundry playlist id. */
  playlistIds: (foundryId: string) => string | undefined;
  skipped: string[];
}

const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;

/** Parses what it can of a list, leaving out what it can't. */
function each<T extends z.ZodType>(schema: T, list: unknown[] | undefined): z.infer<T>[] {
  return (list ?? []).flatMap((x) => {
    const parsed = schema.safeParse(x);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Ids from names, each one free in its list. */
function ids() {
  const taken = new Set<string>();
  return (name: string, fallback: string) => {
    const id = freeId(slugify(name) || fallback, (x) => taken.has(x), { bare: true });
    taken.add(id);
    return id;
  };
}

function pageOf(p: z.infer<typeof FoundryPage>, id: string, media: MediaLookup): JournalPage | undefined {
  if (p.type === 'text') return { id, name: p.name, kind: 'text', text: p.text?.content ?? '' };
  const src = p.type === 'image' && p.src ? media(p.src) : undefined;
  return src ? { id, name: p.name, kind: 'image', src } : undefined;
}

interface Maps {
  entries: Map<string, string>;
  pages: Map<string, string>;
  playlists: Map<string, string>;
  skipped: string[];
  folderOf?: FolderLookup;
}

/** A Foundry folder id as the folder name our sidebar lists show. */
export type FolderLookup = (foundryId: string | null | undefined) => string | undefined;

/** `folder` when the Foundry document was in one. */
const inFolder = (folderOf: FolderLookup | undefined, id: string | null | undefined) => {
  const folder = folderOf?.(id);
  return folder ? { folder } : {};
};

function journalOf(j: z.infer<typeof FoundryJournal>, id: string, media: MediaLookup, maps: Maps): Journal {
  const pageId = ids();
  const raw = j.pages ? each(FoundryPage, j.pages) : [{ name: 'Text', type: 'text', text: { content: j.content } }];
  const lost: string[] = [];
  const pages = raw.flatMap((p) => {
    const page = pageOf(p, pageId(p.name, 'page'), media);
    if (!page) lost.push(p.type);
    else if ('_id' in p && p._id) maps.pages.set(p._id, page.id);
    return page ?? [];
  });
  if (lost.length)
    maps.skipped.push(
      `journal "${j.name}": ${plural(lost.length, 'page')} of a kind we have no match for (${lost.join(', ')})`,
    );
  if (j._id) maps.entries.set(j._id, id);
  return { id, name: j.name, ...inFolder(maps.folderOf, j.folder), pages };
}

function tableOf(t: z.infer<typeof FoundryTable>, id: string, folderOf?: FolderLookup): RollTable {
  const results = t.results.map((r) => {
    const weight = r.weight ?? (r.range ? r.range[1] - r.range[0] + 1 : 1);
    return { text: r.text, weight: Math.max(1, Math.round(weight)), ...(r.drawn ? { drawn: true } : {}) };
  });
  return {
    id,
    name: t.name,
    ...inFolder(folderOf, t.folder),
    ...(t.description ? { description: t.description } : {}),
    ...(t.replacement === undefined ? {} : { replacement: t.replacement }),
    results,
  };
}

const MODES: Playlist['mode'][] = ['sequence', 'shuffle', 'together'];

function playlistOf(p: z.infer<typeof FoundryPlaylist>, id: string, media: MediaLookup, maps: Maps): Playlist {
  const trackId = ids();
  const missing: string[] = [];
  const tracks = p.sounds.flatMap((s): Track[] => {
    const src = s.path ? media(s.path) : undefined;
    if (!src) missing.push(s.path ?? '(none)');
    if (!src) return [];
    const extra = { ...(s.volume === undefined ? {} : { volume: s.volume }), ...(s.repeat ? { repeat: true } : {}) };
    return [{ id: trackId(s.name, 'track'), name: s.name, src, ...extra }];
  });
  if (missing.length)
    maps.skipped.push(
      `playlist "${p.name}": ${plural(missing.length, 'track')} whose file is not in the module (${missing.join(', ')})`,
    );
  if (p._id) maps.playlists.set(p._id, id);
  return { id, name: p.name, ...inFolder(maps.folderOf, p.folder), mode: MODES[p.mode ?? 0] ?? 'sequence', tracks };
}

/** Converts the sidebar documents of a Foundry folder; `media` finds the copied files, `folderOf` names folders. */
export function foundryEntries(raw: RawEntries, media: MediaLookup, folderOf?: FolderLookup): ConvertedEntries {
  const maps: Maps = { entries: new Map(), pages: new Map(), playlists: new Map(), skipped: [], folderOf };
  const [journalId, tableId, playlistId] = [ids(), ids(), ids()];
  const journals = each(FoundryJournal, raw.journals).map((j) => journalOf(j, journalId(j.name, 'entry'), media, maps));
  const tables = each(FoundryTable, raw.tables)
    .filter((t) => t.results.length)
    .map((t) => tableOf(t, tableId(t.name, 'table'), folderOf));
  const playlists = each(FoundryPlaylist, raw.playlists).map((p) =>
    playlistOf(p, playlistId(p.name, 'playlist'), media, maps),
  );
  return {
    journals,
    tables,
    playlists,
    entries: (id) => maps.entries.get(id),
    pages: (id) => maps.pages.get(id),
    playlistIds: (id) => maps.playlists.get(id),
    skipped: maps.skipped,
  };
}
