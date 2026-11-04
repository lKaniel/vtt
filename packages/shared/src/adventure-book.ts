// The adventure book a player opens with J: the journal entries they may
// see, on tabs. Quests are entries with a quest, maps and the party log are
// shelved by `book` (a player's own note is in the log), dated entries make
// the timeline, and everything else is lore.

export const BOOK_TABS = ['quests', 'map', 'lore', 'log', 'timeline'] as const;
export type BookTab = (typeof BOOK_TABS)[number];

/** What the book reads of an entry. */
export interface Shelved {
  quest?: unknown;
  book?: unknown;
  author?: unknown;
  date?: unknown;
}

/** The tab an entry sits under. */
export function bookTabOf(entry: Readonly<Shelved>): BookTab {
  if (entry.quest !== undefined && entry.quest !== null) return 'quests';
  if (entry.book === 'map') return 'map';
  if (entry.book === 'log' || typeof entry.author === 'string') return 'log';
  if (typeof entry.date === 'number') return 'timeline';
  return 'lore';
}

const dateOf = (e: object) => {
  const { date } = e as Shelved;
  return typeof date === 'number' ? date : 0;
};

const STATUS_ORDER = ['active', 'done', 'failed'];
const statusRank = (e: object) => {
  const { quest } = e as { quest?: { status?: unknown } };
  const i = STATUS_ORDER.indexOf(typeof quest?.status === 'string' ? quest.status : 'active');
  return i < 0 ? 0 : i;
};

/** The entries under one tab: quests the open ones first, the timeline in date order. */
export function inBook<T extends object>(entries: readonly T[], tab: BookTab): T[] {
  const here = entries.filter((e) => bookTabOf(e as Shelved) === tab);
  if (tab === 'quests') return here.sort((a, b) => statusRank(a) - statusRank(b));
  return tab === 'timeline' ? here.sort((a, b) => dateOf(a) - dateOf(b)) : here;
}
