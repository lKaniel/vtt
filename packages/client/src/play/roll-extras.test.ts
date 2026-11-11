import { type ClientMessage, FeatureSchema, type FeatureSheet, srdFor, type TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { costHint } from './power-aiming.ts';
import { pickedMessage, planFor, type PlanContext } from './roll-plan.ts';

// The picks an action has besides its roll (roll-extras.ts), which the
// roll dialog asks for so the bars over the action bar need not.

const book = srdFor('2014');
const missile = book.spells.get('magic-missile')!;
const command = book.spells.get('command')!;

const weave = FeatureSchema.parse({
  id: 'weave',
  name: 'Weave',
  level: 1,
  action: 'action',
  cost: 'base * senses * weight',
  inputs: [{ id: 'base', name: 'Base cost', min: 1, default: 1 }],
  options: [
    {
      id: 'senses',
      name: 'Senses',
      required: true,
      list: [
        { id: 'sight', name: 'Sight', cost: 1 },
        { id: 'sound', name: 'Sound', cost: 1 },
      ],
    },
  ],
}) as FeatureSheet;

const hero = {
  id: 'hero',
  name: 'Hero',
  sheet: {
    edition: '2014',
    attacks: [{ name: 'Longsword', kind: 'melee', toHit: 5, damage: [{ dice: '1d8+3', type: 'slashing' }] }],
    features: [weave, { id: 'divine-smite', name: 'Divine Smite' }],
    effects: [],
    caster: { level: 5, spells: [missile, command], slots: [4, 3], left: [2, 1] },
  },
} as unknown as TokenView;

const ctx: PlanContext = { tokens: new Map([['hero', hero]]), fighting: false };
const use: ClientMessage = { t: 'feature', token: 'hero', feature: 'weave', targets: ['goblin'], picks: ['sight'] };

describe('the picks the dialog asks for', () => {
  it("are a pool feature's options and numbers, as they stand", () => {
    const plan = planFor(use, ctx)!;
    expect(plan.extras).toMatchObject([
      { id: 'group-senses', label: 'Senses', kind: 'any', required: true, value: ['sight'] },
      { id: 'input-base', label: 'Base cost', kind: 'number', min: 1, value: 1 },
    ]);
    expect(plan.power?.id).toBe('weave');
  });

  it('go into the feature message once picked', () => {
    const plan = planFor(use, ctx)!;
    const extras = { 'group-senses': ['sight', 'sound'], 'input-base': 3 };
    expect(pickedMessage(plan, { extras }, undefined)).toEqual({
      ...use,
      picks: ['sight', 'sound'],
      inputs: { base: 3 },
    });
    expect(pickedMessage(plan, {}, undefined)).toEqual(use);
  });

  it("are a spell's option", () => {
    const cast: ClientMessage = { t: 'cast', caster: 'hero', spell: 'command', slot: 1, targets: ['goblin'] };
    const plan = planFor({ ...cast, choice: 'approach' }, ctx)!;
    const option = plan.extras.find((e) => e.id === 'choice')!;
    expect(option.options!.map((o) => o.value)).toContain('flee');
    expect(pickedMessage(plan, { extras: { choice: 'flee' } }, undefined)).toMatchObject({ choice: 'flee' });
  });

  it('are the slot to smite with on a melee attack at a creature, or none', () => {
    const swing: ClientMessage = { t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' };
    const plan = planFor(swing, ctx)!;
    expect(plan.extras).toMatchObject([{ id: 'smite', optional: true, value: '' }]);
    expect(plan.extras[0]!.options!.map((o) => o.value)).toEqual(['1', '2']);
    expect(pickedMessage(plan, { extras: { smite: '2' } }, undefined)).toEqual({ ...swing, smite: 2 });
    expect(pickedMessage(plan, { extras: { smite: '' } }, undefined)).toEqual(swing);
    expect(planFor({ ...swing, target: undefined, point: [0, 0] }, ctx)).toBeUndefined();
  });
});

describe('a spell with beams paid with a higher slot', () => {
  it('has as many beams as that slot gives, at the creatures picked', () => {
    const cast: ClientMessage = {
      t: 'cast',
      caster: 'hero',
      spell: 'magic-missile',
      slot: 1,
      targets: ['goblin', 'goblin', 'orc'],
    };
    const plan = planFor(cast, ctx)!;
    const second = plan.payments!.find((p) => p.key === 'slot-2');
    expect(pickedMessage(plan, { payment: second }, undefined)).toMatchObject({
      slot: 2,
      targets: ['goblin', 'goblin', 'orc', 'goblin'],
    });
  });
});

describe('what a pool feature costs as picked', () => {
  it('is said per unit of weight when the targets weigh in', () => {
    expect(costHint(weave, { picks: ['sight', 'sound'], inputs: { base: 2 } })).toBe('Costs 4 × weight of each target');
  });
});
