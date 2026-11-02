import { homebrewIssues } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import {
  blankClass,
  choicesDue,
  classOfDoc,
  classPatch,
  freshId,
  levelTableText,
  parseLevelTable,
  withoutAt,
  withAt,
} from './homebrew-edit.ts';

describe('editing a homebrew class', () => {
  it('writes level tables as "1: 4, 5: 10" and reads them back', () => {
    expect(
      levelTableText([
        [1, 4],
        [5, 10],
      ]),
    ).toBe('1: 4, 5: 10');
    expect(parseLevelTable('5:10, 1: 4,, 30: 2, x: 1')).toEqual([
      [1, 4],
      [5, 10],
    ]);
    expect(parseLevelTable('')).toEqual([]);
  });

  it('starts from a class the rules accept', () => {
    const cls = blankClass('seer', 'Seer');
    expect(homebrewIssues(cls)).toEqual([]);
    expect(cls).toMatchObject({ id: 'seer', kind: 'class', name: 'Seer', hitDie: 8 });
  });

  it('changes and removes list rows', () => {
    expect(withAt(['a', 'b'], 1, 'c')).toEqual(['a', 'c']);
    expect(withoutAt(['a', 'b'], 0)).toEqual(['b']);
  });

  it('counts the options a character still has to pick', () => {
    const cls = {
      ...blankClass('seer', 'Seer'),
      choices: [
        {
          id: 'gift',
          name: 'Gifts',
          count: [
            [2, 1],
            [5, 2],
          ] as [number, number][],
        },
      ],
      features: [
        { id: 'a', name: 'A', level: 2, choice: 'gift', description: '', recharge: 'long' as const },
        { id: 'b', name: 'B', level: 6, choice: 'gift', description: '', recharge: 'long' as const },
      ],
    };
    expect(choicesDue(cls, 5, ['seer/a'])).toEqual([
      { id: 'gift', name: 'Gifts', count: 2, picked: ['a'], options: [{ id: 'a', name: 'A' }] },
    ]);
    expect(choicesDue(cls, 1, [])).toEqual([]);
  });

  it('reads a document into a draft, and the draft back as one patch', () => {
    const doc = { id: 'seer', type: 'homebrew', rev: 2, kind: 'class', name: 'Seer', hitDie: 6, saves: ['wis'] };
    const draft = classOfDoc(doc);
    expect(draft).toMatchObject({ id: 'seer', name: 'Seer', hitDie: 6, features: [] });
    expect(classOfDoc({ id: 'x', type: 'homebrew', rev: 0, kind: 'class', name: 'X', hitDie: 'd8' })).toMatchObject({
      id: 'x',
      name: 'X',
      hitDie: 8,
    });
    expect(classPatch({ ...draft, subclassLevel: 3 })).toMatchObject({
      name: 'Seer',
      hitDie: 6,
      subclassLevel: 3,
      spellcasting: null,
      scales: null,
    });
  });

  it('makes ids from names, free in their list', () => {
    expect(freshId('Far Weaving', [{ id: 'far-weaving' }])).toBe('far-weaving-2');
    expect(freshId('Echo', [])).toBe('echo');
    expect(freshId('!!', [])).toBe('item');
  });
});
