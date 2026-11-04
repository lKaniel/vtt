import { lost as lostThings, type PlacedLoss } from './import-losses.ts';
import type { OwnershipOf } from './foundry-users.ts';
import { freeId, slugify } from '@vtt/core';
import type { Journal, JournalPage, Playlist, RollTable, Track } from '@vtt/shared';
import { z } from 'zod';
import type { MediaLookup } from './foundry-scene.ts';
import {
  bookOfPages,
  isQuestPage,
  isSimpleQuest,
  partyFolders,
  questOfPage,
  simpleQuestPages,
} from './foundry-simple-quest.ts';

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
  /** A module's page data (Simple Quest's quests, maps and lore). */
  system: z.unknown().optional(),
});
type FoundryPage = z.infer<typeof FoundryPage>;

const FoundryJournal = z.object({
  _id: str,
  folder: str,
  name: z.string().min(1),
  pages: z.array(z.unknown()).optional().catch(undefined),
  /** v9: one page of HTML. */
  content: str,
  ownership: z.unknown().optional(),
});

const FoundryTable = z.object({
  name: z.string().min(1),
  ownership: z.unknown().optional(),
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
  /** The world's folders, for the ones a module gives a meaning (Simple Quest's party folder). */
  folders?: unknown[];
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
  skipped: PlacedLoss[];
}

/** Parses what it can of a list, leaving out what it can't. */
export function each<T extends z.ZodType>(schema: T, list: unknown[] | undefined): z.infer<T>[] {
  return (list ?? []).flatMap((x) => {
    const parsed = schema.safeParse(x);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Ids from names, each one free in its list. */
export function ids() {
  const taken = new Set<string>();
  return (name: string, fallback: string) => {
    const id = freeId(slugify(name) || fallback, (x) => taken.has(x), { bare: true });
    taken.add(id);
    return id;
  };
}

type PageIds = (name: string, fallback: string) => string;

/** A Foundry page as ours (a Simple Quest page may make two: its picture and its text); none for a kind we lack. */
function pagesOf(p: FoundryPage, pageId: PageIds, media: MediaLookup): JournalPage[] {
  if (isSimpleQuest(p)) return simpleQuestPages(p, pageId, media);
  if (p.type === 'text')
    return [{ id: pageId(p.name, 'page'), name: p.name, kind: 'text', text: p.text?.content ?? '' }];
  const src = p.type === 'image' && p.src ? media(p.src) : undefined;
  return src ? [{ id: pageId(p.name, 'page'), name: p.name, kind: 'image', src }] : [];
}

interface Maps {
  entries: Map<string, string>;
  pages: Map<string, string>;
  playlists: Map<string, string>;
  skipped: PlacedLoss[];
  folderOf?: FolderLookup;
  ownership?: OwnershipOf;
  /** Foundry folders whose entries go to the party log. */
  party: Set<string>;
}

/** `ownership` for a Foundry document's levels (players see entries Foundry let them see). */
const ownedBy = (maps: Maps, raw: unknown) => {
  const ownership = maps.ownership?.(raw, 'none');
  return ownership ? { ownership } : {};
};

/** A Foundry folder id as the folder name our sidebar lists show. */
export type FolderLookup = (foundryId: string | null | undefined) => string | undefined;

/** `folder` when the Foundry document was in one. */
export const inFolder = (folderOf: FolderLookup | undefined, id: string | null | undefined) => {
  const folder = folderOf?.(id);
  return folder ? { folder } : {};
};

type FoundryJournal = Omit<z.infer<typeof FoundryJournal>, 'pages'> & { pages: FoundryPage[] };

/** An entry's pages: its own, or v9's one page of HTML. */
const pagesIn = (j: z.infer<typeof FoundryJournal>): FoundryPage[] =>
  j.pages ? each(FoundryPage, j.pages) : [{ name: 'Text', type: 'text', text: { content: j.content } }];

/** Each Simple Quest quest page as an entry of its own; the rest stay together (an entry of only quests goes). */
function splitQuests(raw: z.infer<typeof FoundryJournal>): FoundryJournal[] {
  const pages = pagesIn(raw);
  const quests = pages.filter(isQuestPage);
  const rest = { ...raw, pages: pages.filter((p) => !isQuestPage(p)) };
  if (!quests.length) return [rest];
  const keep = rest.pages.length > 0;
  const alone = quests.map((p, i) => ({ ...raw, _id: !keep && i === 0 ? raw._id : null, name: p.name, pages: [p] }));
  return keep ? [rest, ...alone] : alone;
}

/** What the adventure book makes of the entry: a quest, and its shelf. */
function shelfOf(j: FoundryJournal, maps: Maps): Pick<Journal, 'quest' | 'book'> {
  const quest = j.pages.find(isQuestPage);
  if (quest) return { quest: questOfPage(quest) };
  const book = j.folder && maps.party.has(j.folder) ? 'log' : bookOfPages(j.pages);
  return book ? { book } : {};
}

function journalOf(j: FoundryJournal, id: string, media: MediaLookup, maps: Maps): Journal {
  const pageId = ids();
  const lost: string[] = [];
  const pages = j.pages.flatMap((p) => {
    const made = pagesOf(p, pageId, media);
    if (!made.length && !isSimpleQuest(p)) lost.push(p.type);
    else if (made[0] && p._id) maps.pages.set(p._id, made[0].id);
    return made;
  });
  if (lost.length)
    maps.skipped.push({
      ...lostThings('Journal pages of a kind we have no match for', lost.length, lost),
      place: j.name,
    });
  if (j._id) maps.entries.set(j._id, id);
  const placed = { ...inFolder(maps.folderOf, j.folder), ...ownedBy(maps, j.ownership) };
  return { id, name: j.name, ...placed, ...shelfOf(j, maps), pages };
}

function tableOf(t: z.infer<typeof FoundryTable>, id: string, maps: Maps): RollTable {
  const results = t.results.map((r) => {
    const weight = r.weight ?? (r.range ? r.range[1] - r.range[0] + 1 : 1);
    return { text: r.text, weight: Math.max(1, Math.round(weight)), ...(r.drawn ? { drawn: true } : {}) };
  });
  return {
    id,
    name: t.name,
    ...inFolder(maps.folderOf, t.folder),
    ...ownedBy(maps, t.ownership),
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
    maps.skipped.push({
      ...lostThings('Playlist tracks whose file could not be found', missing.length, missing),
      place: p.name,
    });
  if (p._id) maps.playlists.set(p._id, id);
  return { id, name: p.name, ...inFolder(maps.folderOf, p.folder), mode: MODES[p.mode ?? 0] ?? 'sequence', tracks };
}

const ENTRY_LINK = /@UUID\[JournalEntry\.(\w+)(?:\.JournalEntryPage\.(\w+))?\]|@JournalEntry\[(\w+)\]/g;

/** Links between Foundry entries (@UUID[JournalEntry.x.JournalEntryPage.y]) as our links to the entries we made. */
function relink(text: string, maps: Maps): string {
  return text.replace(ENTRY_LINK, (link: string, uuid?: string, page?: string, old?: string) => {
    const entry = maps.entries.get(uuid ?? old ?? '');
    if (!entry) return link;
    const ours = page && maps.pages.get(page);
    return '@journal[' + entry + (ours ? '#' + ours : '') + ']';
  });
}

const relinked = (journal: Journal, maps: Maps): Journal => ({
  ...journal,
  pages: journal.pages.map((p) => (p.text ? { ...p, text: relink(p.text, maps) } : p)),
});

/** Converts the sidebar documents of a Foundry folder; `media` finds the copied files, `folderOf` names folders. */
export function foundryEntries(
  raw: RawEntries,
  media: MediaLookup,
  folderOf?: FolderLookup,
  ownership?: OwnershipOf,
): ConvertedEntries {
  const party = partyFolders(raw.folders);
  const maps: Maps = {
    entries: new Map(),
    pages: new Map(),
    playlists: new Map(),
    skipped: [],
    folderOf,
    ownership,
    party,
  };
  const [journalId, tableId, playlistId] = [ids(), ids(), ids()];
  const journals = each(FoundryJournal, raw.journals)
    .flatMap(splitQuests)
    .map((j) => journalOf(j, journalId(j.name, 'entry'), media, maps))
    .map((j) => relinked(j, maps));
  const tables = each(FoundryTable, raw.tables)
    .filter((t) => t.results.length)
    .map((t) => tableOf(t, tableId(t.name, 'table'), maps));
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
