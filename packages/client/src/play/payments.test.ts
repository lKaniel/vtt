import { srdFor, type TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { actionTiles } from './actions.ts';
import { firstPayment, paymentCount } from './payments.ts';
import { aimFor, castMessage } from './targeting.ts';

// What pays for a cast: a slot of some level, or a feature that casts the
// spell without one (favored enemy, an invocation).

const spell = (id: string) => srdFor('2024').spells.get(id)!;
const mark = spell('hunters-mark');
const armor = spell('mage-armor');

const favored = (left: number) => ({
  id: 'favored-enemy',
  name: 'Favored Enemy',
  freeCasts: [{ spell: 'hunters-mark' }],
  max: 2,
  left,
});
const shadows = { id: 'armor-of-shadows', name: 'Armor of Shadows', freeCasts: [{ spell: 'mage-armor', self: true }] };

function caster(left: number[], features: object[]): TokenView {
  return {
    id: 'pc',
    name: 'PC',
    sheet: { attacks: [], features, effects: [], caster: { level: 3, spells: [mark, armor], left, slots: [2, 1] } },
  } as unknown as TokenView;
}

describe('what a spell is paid with at first', () => {
  it('uses a feature’s free cast before a slot, and a slot once the feature is spent', () => {
    expect(firstPayment(caster([2], [favored(1)]), mark)).toEqual({ slot: 1, paidBy: 'favored-enemy' });
    expect(firstPayment(caster([2], [favored(0)]), mark)).toEqual({ slot: 1 });
    expect(firstPayment(caster([0, 1], [favored(0)]), mark)).toEqual({ slot: 2 });
    expect(firstPayment(caster([0, 0], [favored(0)]), mark)).toEqual({ slot: undefined });
  });

  it('counts the ways to pay: slot levels with a slot left and features with a use', () => {
    expect(paymentCount(caster([2, 1], [favored(1)]), mark)).toBe(3);
    expect(paymentCount(caster([0, 1], [favored(0)]), mark)).toBe(1);
    expect(paymentCount(caster([0, 0], [shadows]), armor)).toBe(1);
  });

  it("pays nothing for a non-caster's homemade spell: one way, at its own level", () => {
    const fighter = {
      id: 'f',
      name: 'F',
      sheet: {
        attacks: [],
        features: [],
        effects: [],
        caster: { spells: [mark], left: [], slots: [], atWill: [mark.id] },
      },
    } as unknown as TokenView;
    expect(paymentCount(fighter, mark)).toBe(1);
    expect(firstPayment(fighter, mark)).toEqual({ slot: 1 });
  });

  it('keeps a spell’s tile usable while a feature can still cast it', () => {
    const tile = (t: TokenView) => actionTiles(t).find((x) => x.name === mark.name);
    expect(tile(caster([0, 0], [favored(1)]))).toMatchObject({ spent: false, slot: 1, paidBy: 'favored-enemy' });
    expect(tile(caster([0, 0], [favored(0)]))).toMatchObject({ spent: true });
    expect(tile(caster([1], []))).not.toHaveProperty('paidBy');
  });
});

describe('aiming a spell a feature pays for', () => {
  it('casts at the feature’s level and tells the server which feature pays', () => {
    const aiming = aimFor(caster([2], [favored(1)]).sheet, 'hunters-mark', { slot: 2, paidBy: 'favored-enemy' })!;
    expect(aiming).toMatchObject({ slot: 1, paidBy: 'favored-enemy', mode: 'creatures' });
    expect(castMessage('pc', { ...aiming, picks: ['gob'] })).toMatchObject({ slot: 1, paidBy: 'favored-enemy' });
  });

  it('aims a self-only free cast at no one: it lands on the caster', () => {
    const sheet = caster([2], [shadows]).sheet;
    expect(aimFor(sheet, 'mage-armor', { slot: 1, paidBy: 'armor-of-shadows' })).toMatchObject({
      mode: 'self',
      need: 0,
    });
    expect(aimFor(sheet, 'mage-armor', { slot: 1 })).toMatchObject({ mode: 'creatures' });
  });

  it('falls back to the slot when the feature can’t pay', () => {
    const aiming = aimFor(caster([2], [favored(0)]).sheet, 'hunters-mark', { slot: 1, paidBy: 'favored-enemy' })!;
    expect(aiming).not.toHaveProperty('paidBy');
  });
});

describe('a class pool paying', () => {
  const borrowed = {
    id: 'borrowed',
    name: 'Borrowed Spells',
    freeCasts: [{ spell: 'hunters-mark', cost: '2 * level' }],
  };
  const pooled = (left: number): TokenView => {
    const token = caster([0], [borrowed]);
    return { ...token, sheet: { ...token.sheet!, pool: { name: 'Lucidity', left } } } as unknown as TokenView;
  };

  it('pays with points while the pool has enough, else not at all', () => {
    expect(firstPayment(pooled(5), mark)).toEqual({ slot: 1, paidBy: 'borrowed' });
    expect(firstPayment(pooled(1), mark)).toEqual({ slot: undefined });
  });
});
