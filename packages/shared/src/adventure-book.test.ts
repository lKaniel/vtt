import { describe, expect, it } from 'vitest';
import { bookTabOf, inBook, JournalSchema } from './index.ts';

// The adventure book (J): which tab each journal entry sits under.

describe('the adventure book', () => {
  it('puts quests under Quests, whatever else they are', () => {
    expect(bookTabOf({ quest: { status: 'active' }, book: 'log', date: 5 })).toBe('quests');
  });

  it('puts map entries under Map', () => {
    expect(bookTabOf({ book: 'map' })).toBe('map');
  });

  it("puts players' own notes and log entries under the party log", () => {
    expect(bookTabOf({ author: 'ann' })).toBe('log');
    expect(bookTabOf({ book: 'log' })).toBe('log');
  });

  it('puts dated entries on the timeline and the rest under Lore', () => {
    expect(bookTabOf({ date: 86400 })).toBe('timeline');
    expect(bookTabOf({})).toBe('lore');
  });

  it('lists a tab’s entries, the timeline by date', () => {
    const docs = [
      { id: 'b', name: 'B', date: 20 },
      { id: 'q', name: 'Q', quest: {} },
      { id: 'a', name: 'A', date: 10 },
    ];
    expect(inBook(docs, 'timeline').map((d) => d.id)).toEqual(['a', 'b']);
    expect(inBook(docs, 'quests').map((d) => d.id)).toEqual(['q']);
    const quests = [
      { id: 'done', quest: { status: 'done' } },
      { id: 'open', quest: { status: 'active' } },
    ];
    expect(inBook(quests, 'quests').map((d) => d.id)).toEqual(['open', 'done']);
  });

  it('keeps book and author on an entry', () => {
    const entry = JournalSchema.parse({ id: 'n', name: 'Notes', book: 'log', author: 'ann' });
    expect(entry).toMatchObject({ book: 'log', author: 'ann' });
    expect(JournalSchema.safeParse({ id: 'n', name: 'N', book: 'shelf' }).success).toBe(false);
  });
});
