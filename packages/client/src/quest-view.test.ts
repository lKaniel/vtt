import { describe, expect, it } from 'vitest';
import { addObjective, questOf, questsBy, removeObjective } from './quest-view.ts';

const doc = (id: string, quest?: object) => ({ id, type: 'journal', rev: 1, name: id, ...(quest && { quest }) });

describe('the quest log', () => {
  it('reads the quest of an entry, if it is one', () => {
    expect(questOf(doc('a', { objectives: [{ text: 'Go' }] }))).toEqual({
      status: 'active',
      objectives: [{ text: 'Go' }],
    });
    expect(questOf(doc('b'))).toBeUndefined();
    expect(questOf(doc('c', { status: 'lost' }))).toBeUndefined();
  });

  it('lists quests under their status', () => {
    const groups = questsBy([doc('a', {}), doc('b', { status: 'done' }), doc('c'), doc('d', { status: 'done' })]);
    expect(groups.map((g) => [g.status, g.quests.map((q) => q.doc.id)])).toEqual([
      ['active', ['a']],
      ['done', ['b', 'd']],
    ]);
  });

  it('adds and removes objectives', () => {
    const quest = { status: 'active' as const, objectives: [{ text: 'Go' }] };
    expect(addObjective(quest, '  Come back ').objectives).toEqual([{ text: 'Go' }, { text: 'Come back' }]);
    expect(addObjective(quest, '  ')).toBe(quest);
    expect(removeObjective(quest, 0).objectives).toEqual([]);
  });
});
