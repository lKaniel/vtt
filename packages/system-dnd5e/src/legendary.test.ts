import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { startCombat } from './combat.ts';
import { rollSave } from './effects.ts';
import { rest } from './features.ts';
import {
  isLairTurn,
  lairOwner,
  legendaryProblem,
  refreshLegendary,
  resistSave,
  spendLegendary,
  withLair,
} from './legendary.ts';
import { TokenSchema } from './token-schema.ts';

const book = srdFor('2014');
const dragon = (data: object = {}) =>
  TokenSchema.parse({ id: 'd', name: 'Dragon', x: 50, y: 50, monster: 'adult-black-dragon', ...data });
const sheetOf = (t: ReturnType<typeof dragon>) => resolveCreature(t, book)!;
const fight = {
  round: 1,
  turn: 0,
  order: [
    { token: 'hero', initiative: 15 },
    { token: 'd', initiative: 10 },
  ],
};

describe('legendary actions', () => {
  it('come from the stat block, with the pool left this round', () => {
    const sheet = sheetOf(dragon({ spent: { uses: { legendary: 1 } } }));
    expect(sheet.legendary).toMatchObject({ actions: 3, left: 2 });
    expect(sheet.legendary?.options.map((o) => o.id)).toEqual(['detect', 'tail-attack', 'wing-attack']);
    expect(sheet.legendaryResistance).toEqual({ total: 3, left: 3 });
  });

  it("are taken at the end of another creature's turn, within the pool", () => {
    const d = dragon();
    const combat = startCombat([], () => 0);
    expect(legendaryProblem(d, sheetOf(d), undefined, 'detect')).toMatch(/fight/);
    expect(legendaryProblem(d, sheetOf(d), { ...combat, ...fight, turn: 1 }, 'detect')).toMatch(/own turn/);
    expect(legendaryProblem(d, sheetOf(d), { ...combat, ...fight }, 'detect')).toBeUndefined();
    const spent = spendLegendary(spendLegendary(d, 2), 1);
    expect(legendaryProblem(spent, sheetOf(spent), { ...combat, ...fight }, 'detect')).toMatch(
      /no legendary actions left/,
    );
    expect(legendaryProblem(d, sheetOf(d), { ...combat, ...fight }, 'nope')).toMatch(/no such/);
    const goblin = TokenSchema.parse({ id: 'g', name: 'Goblin', x: 0, y: 0, monster: 'goblin' });
    expect(legendaryProblem(goblin, resolveCreature(goblin, book)!, { ...combat, ...fight }, 'x')).toMatch(
      /no legendary/,
    );
  });

  it('come back at the start of its turn', () => {
    expect(refreshLegendary(spendLegendary(dragon(), 2)).spent).toBeUndefined();
  });

  it('can be given to any creature through its stats', () => {
    const boss = TokenSchema.parse({
      id: 'b',
      name: 'Boss',
      x: 0,
      y: 0,
      stats: { legendary: { actions: 2, options: [{ id: 'step', name: 'Step' }] }, legendaryResistance: 1 },
    });
    expect(resolveCreature(boss, book)?.legendary).toMatchObject({ actions: 2, left: 2 });
  });
});

describe('legendary resistance', () => {
  it('turns a failed save into a success while it lasts, and comes back on a long rest only', () => {
    const d = dragon();
    const failed = rollSave(sheetOf(d), 'wis', 30, () => 0);
    expect(resistSave(sheetOf(d), failed)).toMatchObject({ success: true, legendary: true });
    const used = dragon({ spent: { uses: { 'legendary-resistance': 3 } } });
    expect(resistSave(sheetOf(used), failed)).toBe(failed);
    expect(rest(used, sheetOf(used), 'short').spent?.uses?.['legendary-resistance']).toBe(3);
    expect(rest(used, sheetOf(used), 'long').spent).toBeUndefined();
  });
});

describe('lair actions', () => {
  it('take a turn on initiative 20, losing ties', () => {
    const combat = {
      ...startCombat([], () => 0),
      order: [
        { token: 'a', initiative: 22 },
        { token: 'b', initiative: 20 },
        { token: 'c', initiative: 5 },
      ],
    };
    const lair = withLair(combat, ['d']);
    expect(lair.order.map((e) => e.token)).toEqual(['a', 'b', 'lair:d', 'c']);
    expect(isLairTurn('lair:d')).toBe(true);
    expect(lairOwner('lair:d')).toBe('d');
    expect(withLair(combat, []).order).toHaveLength(3);
  });
});
