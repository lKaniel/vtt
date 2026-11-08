import { describe, expect, it } from 'vitest';
import { firstPicks, fightCandidates, notFighting, turnPicks, type FightCandidate } from './fight-pick.ts';

// Who the GM may put in a fight, and who is ticked when the picker opens.

const view = (id: string, more: object = {}) =>
  ({ id, name: id, x: 0, y: 0, hidden: false, sheet: { hp: 7 }, ...more }) as never;

describe('fightCandidates', () => {
  it('lists the creatures with stats, the party first, and leaves out tokens without them', () => {
    const tokens = [
      view('goblin'),
      view('hero', { ownership: { default: 'limited', ana: 'owner' } }),
      view('barrel', { sheet: undefined }),
      view('ghost', { hidden: true }),
    ];
    const party = (t: { id: string }) => t.id === 'hero';
    expect(fightCandidates(tokens, party).map((c) => [c.id, c.party, c.hidden])).toEqual([
      ['hero', true, false],
      ['ghost', false, true],
      ['goblin', false, false],
    ]);
  });
});

describe('firstPicks', () => {
  const all: FightCandidate[] = [
    { id: 'hero', name: 'Hero', party: true, hidden: false },
    { id: 'goblin', name: 'Goblin', party: false, hidden: false },
    { id: 'ghost', name: 'Ghost', party: false, hidden: true },
    { id: 'wolf', name: 'Wolf', party: false, hidden: false },
  ];

  it('ticks the creatures the GM selected, when two or more are', () => {
    expect(firstPicks(all, ['hero', 'ghost'], ['hero', 'goblin'])).toEqual(['hero', 'ghost']);
  });

  it('else ticks those on screen and not hidden', () => {
    expect(firstPicks(all, ['hero'], ['hero', 'goblin', 'ghost'])).toEqual(['hero', 'goblin']);
  });
});

describe('turnPicks', () => {
  const all: FightCandidate[] = [
    { id: 'hero', name: 'Hero', party: true, hidden: false },
    { id: 'mage', name: 'Mage', party: true, hidden: false },
    { id: 'goblin', name: 'Goblin', party: false, hidden: false },
  ];

  it('ticks the party and whoever the GM selected', () => {
    expect(turnPicks(all, ['goblin'])).toEqual(['hero', 'mage', 'goblin']);
  });

  it('ticks only the party when nothing is selected', () => {
    expect(turnPicks(all, [])).toEqual(['hero', 'mage']);
  });
});

describe('notFighting', () => {
  it('leaves out the creatures already in the order', () => {
    const all: FightCandidate[] = [
      { id: 'hero', name: 'Hero', party: true, hidden: false },
      { id: 'goblin', name: 'Goblin', party: false, hidden: false },
    ];
    expect(notFighting(all, { order: [{ token: 'hero', initiative: 12 }] }).map((c) => c.id)).toEqual(['goblin']);
  });
});
