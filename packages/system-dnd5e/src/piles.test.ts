import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { cpOf, earn, moveCoins, pay, putIn, takeOut, tradeCost } from './piles.ts';
import { TokenSchema } from './token-schema.ts';

const book = srdFor('2014');

describe('coins', () => {
  it('are counted in copper', () => {
    expect(cpOf({ gp: 2, sp: 3, cp: 4, pp: 1, ep: 1 })).toBe(1000 + 200 + 50 + 30 + 4);
    expect(cpOf(undefined)).toBe(0);
  });

  it('are paid from the small coins up, with change in gold, silver and copper', () => {
    expect(pay({ gp: 5, cp: 30 }, 20)).toEqual({ gp: 5, cp: 10 });
    expect(pay({ gp: 5, cp: 30 }, 150)).toEqual({ gp: 3, sp: 8 });
    expect(pay({ pp: 1, gp: 1 }, 150)).toEqual({ gp: 9, sp: 5 });
    expect(pay({ gp: 1 }, 101)).toBeUndefined();
  });

  it('are earned as gold, silver and copper', () => {
    expect(earn({ gp: 1 }, 257)).toEqual({ gp: 3, sp: 5, cp: 7 });
    expect(earn(undefined, 0)).toEqual({});
  });

  it('change hands kind by kind', () => {
    expect(moveCoins({ gp: 3, sp: 1 }, { gp: 1 }, { gp: 2 })).toEqual({ from: { gp: 1, sp: 1 }, to: { gp: 3 } });
    expect(moveCoins({ gp: 3 }, {}, { gp: 4 })).toEqual({ problem: 'There are only 3 gp' });
  });
});

describe('moving gear', () => {
  const list = TokenSchema.parse({
    id: 'p',
    name: 'Pile',
    x: 0,
    y: 0,
    inventory: [
      { item: 'dagger', qty: 3 },
      { id: 'pack', item: 'backpack' },
      { item: 'rope', in: 'pack' },
      { id: 'inner', item: 'pouch', in: 'pack' },
      { item: 'torch', qty: 2, in: 'inner' },
    ],
  }).inventory!;

  it('takes part of a stack', () => {
    const out = takeOut(list, 0, 2);
    expect(out).toMatchObject({ moved: [{ item: 'dagger', qty: 2 }] });
    expect('rest' in out && out.rest[0]).toMatchObject({ item: 'dagger', qty: 1 });
    expect(takeOut(list, 0, 4)).toEqual({ problem: 'There are only 3' });
    expect(takeOut(list, 9, 1)).toEqual({ problem: 'There is no such item' });
  });

  it('takes a container with everything in it', () => {
    const out = takeOut(list, 1, 1);
    expect('moved' in out && out.moved.map((e) => e.item)).toEqual(['backpack', 'rope', 'pouch', 'torch']);
    expect('rest' in out && out.rest.map((e) => e.item)).toEqual(['dagger']);
  });

  it('puts gear in loose and unequipped, stacking it or renaming containers that clash', () => {
    const into = [
      { item: 'dagger', qty: 1, equipped: true },
      { id: 'pack', item: 'backpack', equipped: false, qty: 1 },
    ];
    const daggers = putIn(into, [{ item: 'dagger', qty: 2, equipped: true, attuned: true }]);
    expect(daggers[0]).toMatchObject({ item: 'dagger', qty: 3, equipped: true });
    const moved = takeOut(list, 1, 1);
    const packs = putIn(into, 'moved' in moved ? moved.moved : []);
    expect(packs.slice(2)).toMatchObject([
      { id: 'pack-2', item: 'backpack' },
      { item: 'rope', in: 'pack-2' },
      { id: 'inner', item: 'pouch', in: 'pack-2' },
      { item: 'torch', in: 'inner' },
    ]);
  });
});

describe('prices', () => {
  it('are the book prices times the rate, in copper; magic items have none', () => {
    expect(tradeCost([{ item: 'longsword', qty: 2, equipped: false }], book, 1)).toBe(3000);
    expect(tradeCost([{ item: 'torch', qty: 3, equipped: false }], book, 0.5)).toBe(2);
    expect(tradeCost([{ item: 'bag-of-holding', qty: 1, equipped: false }], book, 1)).toBeUndefined();
  });
});
