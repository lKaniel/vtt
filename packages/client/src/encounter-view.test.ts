import { srdFor, type TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { encounterOf, xpLine, xpShares } from './encounter-view.ts';

const t = (data: Partial<TokenView> & { id: string }): TokenView =>
  ({ name: data.id, x: 0, y: 0, size: 1, speed: 30, hidden: false, ...data }) as TokenView;

describe('the encounter builder', () => {
  const tokens = [
    t({ id: 'ana', ownership: { default: 'none', ana: 'owner' }, stats: { class: 'fighter', level: 3 } }),
    t({
      id: 'bo',
      ownership: { default: 'none', bo: 'owner' },
      stats: {
        classes: [
          { class: 'wizard', level: 2 },
          { class: 'cleric', level: 1 },
        ],
      },
    }),
    t({ id: 'gob1', name: 'Goblin', monster: 'goblin' }),
    t({ id: 'gob2', name: 'Goblin', monster: 'goblin' }),
    t({ id: 'tree', name: 'Tree' }),
    t({ id: 'phantom', monster: 'wolf', visibleTo: ['ana'] }),
    t({ id: 'pet', ownership: { default: 'none', ana: 'owner' }, monster: 'wolf' }),
  ];

  it('finds the party’s characters and the monsters they face', () => {
    const e = encounterOf(tokens, srdFor('2014'));
    expect(e.party.map((p) => [p.id, p.level])).toEqual([
      ['ana', 3],
      ['bo', 3],
    ]);
    expect(e.foes.map((f) => [f.id, f.cr])).toEqual([
      ['gob1', 0.25],
      ['gob2', 0.25],
    ]);
  });

  it('splits the XP evenly, rounding down', () => {
    expect(xpShares(100, 3)).toBe(33);
    expect(xpShares(100, 0)).toBe(0);
  });

  it('shows a character’s XP toward the next level', () => {
    expect(xpLine({ level: 3, xp: 1200 })).toBe('1200/2700 XP');
    expect(xpLine({ level: 3, xp: 2800 })).toBe('2800 XP, level 4 reached');
    expect(xpLine({ level: 20, xp: 400000 })).toBe('400000 XP');
    expect(xpLine({ level: 3 })).toBeUndefined();
  });
});
