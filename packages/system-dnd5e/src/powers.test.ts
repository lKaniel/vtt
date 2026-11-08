import { describe, expect, it } from 'vitest';
import { FeatureSchema } from './spell-schema.ts';
import { pickedSpell, powerAt, powerCost } from './powers.ts';

// Pool features: their upgrades by level, the options a character knows,
// what a use costs and the spell it is aimed like.

const weave = FeatureSchema.parse({
  id: 'weave',
  name: 'Weave Illusion',
  level: 1,
  action: 'action',
  cost: 'base * senses * weight',
  hold: true,
  inputs: [{ id: 'base', name: 'Base cost', min: 1, default: 1 }],
  options: [
    {
      id: 'senses',
      name: 'Senses',
      required: true,
      list: [
        { id: 'sight', name: 'Sight', cost: 1 },
        { id: 'sound', name: 'Sound', cost: 1 },
        { id: 'touch', name: 'Touch', level: 3, cost: 2 },
        {
          id: 'pain',
          name: 'Pain',
          level: 7,
          cost: 5,
          set: { effect: { disadvantage: true } },
          upgrades: [{ level: 9, set: { effect: { noReactions: true } } }],
        },
      ],
    },
  ],
  spell: { targets: 10, range: 60, effect: { name: 'Weave', linked: true } },
  upgrades: [{ level: 7, set: { spell: { range: 120 } } }],
});

const bolt = FeatureSchema.parse({
  id: 'bolt',
  name: 'Phantasmal Bolt',
  level: 1,
  action: 'action',
  cost: 'shapes',
  linkedTimes: 0.5,
  modFrom: 2,
  times: [
    [1, 1],
    [3, 1.5],
  ],
  options: [
    {
      id: 'shapes',
      name: 'Shapes',
      list: [
        { id: 'disorienting', name: 'Disorienting', cost: 'weight', set: { effect: { speed: -10, rounds: 1 } } },
        { id: 'subtle', name: 'Subtle', level: 2, cost: 'first' },
        { id: 'ricochet', name: 'Ricochet', level: 9, cost: '2 * weight * (1 - first)', set: { targets: 2 } },
        { id: 'overcharged', name: 'Overcharged', level: 11, cost: '4 * weight', times: 2 },
        {
          id: 'nightmare',
          name: 'Nightmare',
          level: 15,
          cost: '4 * weight',
          set: { effect: { conditions: ['frightened'], rounds: 1 } },
        },
      ],
    },
  ],
  spell: { attack: 'ranged', range: 120, damage: [{ dice: '1d10+{mod}', type: 'psychic' }] },
});

const at = (level: number, known: string[] = []) => ({ level, mod: 3, known: new Set(known), cls: 'illusionist' });

describe('a pool feature at a level', () => {
  it('takes its upgrades', () => {
    expect(powerAt(weave, at(1)).spell?.range).toBe(60);
    expect(powerAt(weave, at(7)).spell).toMatchObject({ range: 120, targets: 10 });
  });

  it('offers the options learned by then, or discovered early', () => {
    const names = (level: number, known?: string[]) =>
      powerAt(weave, at(level, known)).options![0]!.list.map((o) => o.id);
    expect(names(1)).toEqual(['sight', 'sound']);
    expect(names(3)).toEqual(['sight', 'sound', 'touch']);
    expect(names(1, ['illusionist/pain'])).toEqual(['sight', 'sound', 'pain']);
  });

  it('upgrades an option from its level', () => {
    const pain = (level: number) => powerAt(weave, at(level)).options![0]!.list.find((o) => o.id === 'pain')!;
    expect(pain(7).set).toEqual({ effect: { disadvantage: true } });
    expect(pain(9).set).toEqual({ effect: { disadvantage: true, noReactions: true } });
  });

  it('fills in the modifier from its level and the damage multiplier', () => {
    expect(powerAt(bolt, at(1)).spell).toMatchObject({ damage: [{ dice: '1d10' }], damageTimes: 1 });
    expect(powerAt(bolt, at(3)).spell).toMatchObject({ damage: [{ dice: '1d10+3' }], damageTimes: 1.5 });
    const weak = { ...at(3), mod: -1 };
    expect(powerAt(bolt, weak).spell?.damage).toEqual([{ dice: '1d10-1', type: 'psychic' }]);
  });
});

describe('what a use costs', () => {
  const w = powerAt(weave, at(3));

  it('works out the formula for each target and adds it up', () => {
    const targets = [{ weight: 0.5 }, { weight: 2 }];
    expect(powerCost(w, { picks: ['sight', 'sound'], inputs: {}, targets })).toBe(5);
    expect(powerCost(w, { picks: ['sight', 'touch'], inputs: { base: 2 }, targets })).toBe(15);
  });

  it('refuses options it does not know, and a missing required pick', () => {
    expect(() => powerCost(w, { picks: ['pain'], inputs: {}, targets: [] })).toThrow(/pain/i);
    expect(() => powerCost(w, { picks: [], inputs: {}, targets: [] })).toThrow(/Senses/);
  });

  it('keeps inputs at their minimum', () => {
    expect(powerCost(w, { picks: ['sight'], inputs: { base: 0 }, targets: [{ weight: 1 }] })).toBe(1);
  });

  it('halves costs against linked targets, and counts first-only costs once', () => {
    const b = powerAt(bolt, at(9));
    const targets = [{ weight: 2, linked: true }, { weight: 1 }];
    // disorienting: 2/2 + 1; subtle: 1/2 (first, linked); ricochet: second target 2*1
    expect(powerCost(b, { picks: ['disorienting', 'subtle', 'ricochet'], inputs: {}, targets })).toBe(1 + 1 + 0.5 + 2);
    expect(powerCost(b, { picks: [], inputs: {}, targets })).toBe(0);
  });
});

describe('the spell a use is aimed like', () => {
  it('sets the picked options over it, adding their effects together', () => {
    const b = powerAt(bolt, at(15));
    const spell = pickedSpell(b, ['disorienting', 'nightmare', 'overcharged']);
    expect(spell.effect).toEqual({ speed: -10, rounds: 1, conditions: ['frightened'] });
    expect(spell.damageTimes).toBe(1.5 * 2);
    expect(pickedSpell(b, []).effect).toBeUndefined();
  });

  it('keeps the feature effect and adds the picked ones to it', () => {
    const spell = pickedSpell(powerAt(weave, at(9)), ['sight', 'pain']);
    expect(spell.effect).toEqual({ name: 'Weave', linked: true, disadvantage: true, noReactions: true });
  });
});
