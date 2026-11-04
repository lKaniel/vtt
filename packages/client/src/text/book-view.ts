import type { Doc } from '@vtt/core';
import { type BookTab, questProgress } from '@vtt/shared';
import { t } from '../i18n/index.ts';
import { questsBy } from './quest-view.ts';

// The adventure book's left-hand list: a tab's entries in groups. Quests by
// status, lore by folder, the party log by who wrote it, the timeline by day.

export interface BookItem {
  doc: Doc;
  /** A word beside the name: a quest's progress, a timeline day. */
  hint?: string;
}

export interface BookGroup {
  /** The group's heading; '' for entries outside any group. */
  label: string;
  items: BookItem[];
}

export interface BookContext {
  /** Your player id. */
  you?: string;
  folderName(id: string): string | undefined;
  /** A game time (seconds) as the calendar writes it. */
  dateLabel(seconds: number): string;
}

const nonEmpty = (groups: BookGroup[]) => groups.filter((g) => g.items.length);

function questGroups(docs: readonly Doc[]): BookGroup[] {
  return questsBy(docs).map((g) => ({
    label: g.label,
    items: g.quests.map(({ doc, quest }) => {
      const { done, total } = questProgress(quest);
      return total ? { doc, hint: `${done}/${total}` } : { doc };
    }),
  }));
}

function loreGroups(docs: readonly Doc[], ctx: BookContext): BookGroup[] {
  const groups = new Map<string, BookItem[]>([['', []]]);
  for (const doc of docs) {
    const label = (typeof doc.folder === 'string' ? ctx.folderName(doc.folder) : undefined) ?? '';
    groups.set(label, [...(groups.get(label) ?? []), { doc }]);
  }
  return nonEmpty([...groups].map(([label, items]) => ({ label, items })));
}

function logGroups(docs: readonly Doc[], ctx: BookContext): BookGroup[] {
  const by = (test: (author: unknown) => boolean) => docs.filter((d) => test(d.author)).map((doc) => ({ doc }));
  return nonEmpty([
    { label: t('book.group.yours'), items: by((a) => typeof a === 'string' && a === ctx.you) },
    { label: t('book.group.party'), items: by((a) => typeof a === 'string' && a !== ctx.you) },
    { label: t('book.group.gm'), items: by((a) => a === undefined) },
  ]);
}

const dated = (docs: readonly Doc[], ctx: BookContext): BookGroup[] => [
  { label: '', items: docs.map((doc) => ({ doc, hint: ctx.dateLabel(Number(doc.date)) })) },
];

/** A tab's entries (already the tab's, in order) in the groups its list shows. */
export function bookGroups(tab: BookTab, docs: readonly Doc[], ctx: BookContext): BookGroup[] {
  if (tab === 'quests') return questGroups(docs);
  if (tab === 'lore') return loreGroups(docs, ctx);
  if (tab === 'log') return logGroups(docs, ctx);
  if (tab === 'timeline') return nonEmpty(dated(docs, ctx));
  return nonEmpty([{ label: '', items: docs.map((doc) => ({ doc })) }]);
}

/** Whether an entry's name or page text has `query` in it (any case). */
export function matches(doc: Doc, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const pages = Array.isArray(doc.pages) ? (doc.pages as { name?: unknown; text?: unknown }[]) : [];
  const words = [doc.name, ...pages.flatMap((p) => [p.name, p.text])];
  return words.some((w) => typeof w === 'string' && w.toLowerCase().includes(q));
}
