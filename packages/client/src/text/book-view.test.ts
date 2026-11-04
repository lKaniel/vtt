import type { Doc } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { bookGroups, matches } from './book-view.ts';

// The adventure book's left-hand list (book-view.ts): each tab's entries in groups.

const doc = (id: string, fields: Record<string, unknown> = {}): Doc => ({
  id,
  type: 'journal',
  rev: 1,
  name: id,
  pages: [],
  ...fields,
});

const ctx = {
  you: 'ana',
  folderName: (id: string) => (id === 'f-npcs' ? 'NPCs' : undefined),
  dateLabel: (s: number) => `Day ${s / 86400}`,
};
const ids = (groups: ReturnType<typeof bookGroups>) => groups.map((g) => [g.label, g.items.map((i) => i.doc.id)]);

describe('the adventure book list', () => {
  it('groups quests by status, with their progress', () => {
    const groups = bookGroups(
      'quests',
      [
        doc('a', { quest: { status: 'done', objectives: [] } }),
        doc('b', { quest: { status: 'active', objectives: [{ text: 'x', done: true }, { text: 'y' }] } }),
      ],
      ctx,
    );
    expect(ids(groups)).toEqual([
      ['Active', ['b']],
      ['Done', ['a']],
    ]);
    expect(groups[0]!.items[0]!.hint).toBe('1/2');
  });

  it('groups lore by folder, loose entries first', () => {
    expect(ids(bookGroups('lore', [doc('wolf', { folder: 'f-npcs' }), doc('inn')], ctx))).toEqual([
      ['', ['inn']],
      ['NPCs', ['wolf']],
    ]);
  });

  it('splits the party log into your notes, the party’s and the GM’s', () => {
    const docs = [doc('mine', { author: 'ana' }), doc('bos', { author: 'bo' }), doc('story', { book: 'log' })];
    expect(ids(bookGroups('log', docs, ctx))).toEqual([
      ['Your notes', ['mine']],
      ['The party’s notes', ['bos']],
      ['From the GM', ['story']],
    ]);
  });

  it('shows the timeline’s days', () => {
    const groups = bookGroups('timeline', [doc('raid', { date: 86400 })], ctx);
    expect(groups[0]!.items[0]!.hint).toBe('Day 1');
  });

  it('finds entries by name or page text', () => {
    const d = doc('Wolf', { pages: [{ id: 'p', name: 'Story', text: 'A grey wolf howls.' }] });
    expect(matches(d, 'wolf')).toBe(true);
    expect(matches(d, 'GREY')).toBe(true);
    expect(matches(d, 'dragon')).toBe(false);
    expect(matches(d, '')).toBe(true);
  });
});
