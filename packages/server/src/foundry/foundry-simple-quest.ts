import type { Journal, JournalPage, Objective, Quest } from '@vtt/shared';
import { z } from 'zod';
import type { MediaLookup } from './foundry-scene.ts';

// Simple Quest, the Foundry module whose J key opened a quest book: its
// journal page types (simple-quest.quest, .map, .character, ...) as our
// pages, quests and adventure-book shelves (adventure-book.ts in shared).
// Each quest page is a quest of its own; the entry holding it was only a
// category ("In Progress"). Entries in its party folder go to the party log.

const MODULE = 'simple-quest';
const PREFIX = `${MODULE}.`;

const Row = z.object({
  name: z.string().catch(''),
  value: z.unknown(),
  description: z.string().optional().catch(undefined),
});
const List = z.object({ label: z.string().optional().catch(undefined), list: z.array(Row).catch([]) });

const System = z
  .object({
    status: z.number().optional().catch(undefined),
    src: z.string().nullable().optional().catch(undefined),
    subtitle: z.string().optional().catch(undefined),
    mainTag: z
      .object({ value: z.string().optional().catch(undefined) })
      .optional()
      .catch(undefined),
    tags: z.array(z.string()).optional().catch(undefined),
    objectiveState: z.record(z.string(), z.number()).optional().catch(undefined),
  })
  .loose();
type System = z.infer<typeof System>;

/** A Simple Quest page as the importer reads it. */
export interface SqPage {
  name: string;
  type: string;
  text?: { content?: string | null };
  system?: unknown;
}

export const isSimpleQuest = (p: { type: string }) => p.type.startsWith(PREFIX);
export const isQuestPage = (p: { type: string }) => p.type === `${PREFIX}quest`;

const systemOf = (p: SqPage): System => System.safeParse(p.system ?? {}).data ?? {};

/** Simple Quest's 0 in progress, 1 completed, 2 failed (-1 undiscovered: still to do). */
const STATUS: Record<number, Quest['status']> = { 1: 'done', 2: 'failed' };

/** Simple Quest's key for an objective: its text, slugged, as its checkboxes store it. */
const keyOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

const plain = (html: string) =>
  html
    .replace(/<[^<>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** A quest page's quest: its status, and the items of its lists as objectives, ticked where Simple Quest had them checked. */
export function questOfPage(p: SqPage): Quest {
  const sys = systemOf(p);
  const state = sys.objectiveState ?? {};
  const items = [...(p.text?.content ?? '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => plain(m[1]!));
  const objectives = items
    .filter(Boolean)
    .map((text): Objective => (state[keyOf(text)] === 1 ? { text, done: true } : { text }));
  return { status: STATUS[sys.status ?? 0] ?? 'active', objectives };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function valueOf(row: z.infer<typeof Row>): string {
  if (typeof row.value === 'string' || typeof row.value === 'number') return String(row.value);
  return row.description ?? '';
}

/** The facts a lore-like page lists (tables, icon lists, tags) as HTML lists under their labels. */
function factsOf(sys: System): string {
  const lists = Object.entries(sys).flatMap(([, v]) => {
    const parsed = List.safeParse(v);
    return parsed.success && parsed.data.list.length ? [parsed.data] : [];
  });
  return lists
    .map((l) => {
      const rows = l.list.map((r) => `<li><strong>${esc(r.name)}</strong>: ${esc(valueOf(r))}</li>`).join('');
      const head = l.label ? '<h3>' + esc(l.label) + '</h3>' : '';
      return `${head}<ul>${rows}</ul>`;
    })
    .join('');
}

/** The text above a page's own: its subtitle, headline tag and tags. */
function headOf(sys: System): string {
  const tags = sys.tags?.length ? sys.tags.join(', ') : '';
  return [sys.subtitle, sys.mainTag?.value, tags]
    .filter((s): s is string => !!s)
    .map((s) => `<p><em>${esc(s)}</em></p>`)
    .join('');
}

/** A Simple Quest page as our pages: its picture, then its text with its facts. */
export function simpleQuestPages(
  p: SqPage,
  pageId: (name: string, fallback: string) => string,
  media: MediaLookup,
): JournalPage[] {
  const sys = systemOf(p);
  const src = sys.src ? media(sys.src) : undefined;
  const picture: JournalPage[] = src ? [{ id: pageId(p.name, 'page'), name: p.name, kind: 'image', src }] : [];
  const map = p.type === `${PREFIX}map`;
  const text = headOf(sys) + (p.text?.content ?? '') + (map ? '' : factsOf(sys));
  if (!plain(text)) return picture;
  const name = picture.length ? `${p.name}: notes` : p.name;
  return [...picture, { id: pageId(name, 'page'), name, kind: 'text', text }];
}

/** Where the book shelves an entry of these pages: maps when it holds a map page. */
export function bookOfPages(pages: readonly { type: string }[]): Journal['book'] {
  return pages.some((p) => p.type === `${PREFIX}map`) ? 'map' : undefined;
}

const Folder = z.object({
  _id: z.string(),
  folder: z.string().nullable().optional().catch(undefined),
  flags: z.record(z.string(), z.unknown()).optional().catch(undefined),
});

const dirOf = (f: z.infer<typeof Folder>) =>
  (f.flags?.[MODULE] as { simpleQuestDir?: unknown } | undefined)?.simpleQuestDir;

/** The Foundry folders inside Simple Quest's party folder (itself too): the players' journals. */
export function partyFolders(raw: readonly unknown[] | undefined): Set<string> {
  const folders = (raw ?? []).flatMap((f) => Folder.safeParse(f).data ?? []);
  const party = new Set(folders.filter((f) => dirOf(f) === 'party').map((f) => f._id));
  let grew = party.size > 0;
  while (grew) {
    const more = folders.filter((f) => f.folder && party.has(f.folder) && !party.has(f._id));
    for (const f of more) party.add(f._id);
    grew = more.length > 0;
  }
  return party;
}
