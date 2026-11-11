import { srdFor, type ClientMessage, type TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { pickedMessage, planFor, type PlanContext } from './roll-plan.ts';

// What the roll dialog offers for an action about to be sent, and the
// message it becomes once the player has picked.

const book = srdFor('2014');
const bolt = book.spells.get('fire-bolt')!;
const hands = book.spells.get('burning-hands')!;
const step = book.spells.get('misty-step')!;

const hero = {
  id: 'hero',
  name: 'Hero',
  sheet: {
    edition: '2014',
    attacks: [
      { name: 'Longsword', kind: 'melee', toHit: 5, damage: [{ dice: '1d8+3', type: 'slashing' }] },
      { name: 'Dagger', kind: 'melee', toHit: 5, offHand: true, damage: [{ dice: '1d4', type: 'piercing' }] },
    ],
    features: [
      { id: 'second-wind', name: 'Second Wind', action: 'bonus' },
      { id: 'lore', name: 'Lore' },
    ],
    effects: [],
    caster: { level: 5, spells: [bolt, hands, step], slots: [4, 3, 2], left: [2, 0, 1] },
  },
} as unknown as TokenView;
const goblin = { id: 'goblin', name: 'Goblin' } as unknown as TokenView;

const ctx = (fighting = true): PlanContext => ({
  tokens: new Map([
    ['hero', hero],
    ['goblin', goblin],
  ]),
  fighting,
});
const swing: ClientMessage = { t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' };

describe('what the dialog offers', () => {
  it('for an attack: the roll, the damage, and the action it spends in a fight', () => {
    expect(planFor(swing, ctx())).toMatchObject({
      what: { kind: 'attack', name: 'Longsword', target: 'Goblin' },
      ask: { kind: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' },
      crit: true,
      damage: true,
      spend: 'action',
    });
    expect(planFor({ ...swing, attack: 'Dagger' }, ctx())?.spend).toBe('bonus');
    expect(planFor(swing, ctx(false))?.spend).toBeUndefined();
  });

  it('for a spell: its attack roll, its damage, its casting time and what can pay', () => {
    const cast: ClientMessage = { t: 'cast', caster: 'hero', spell: 'fire-bolt', slot: 0, targets: ['goblin'] };
    expect(planFor(cast, ctx())).toMatchObject({
      what: { kind: 'spell', name: 'Fire Bolt', target: 'Goblin' },
      ask: { kind: 'spell', caster: 'hero', spell: 'fire-bolt', target: 'goblin' },
      crit: true,
      damage: true,
      spend: 'action',
    });
    const burn = planFor({ t: 'cast', caster: 'hero', spell: 'burning-hands', slot: 1, targets: ['goblin'] }, ctx())!;
    expect(burn).toMatchObject({ crit: false, damage: true });
    expect(burn.ask).toBeUndefined();
    expect(burn.payments?.map((p) => p.key)).toEqual(['slot-1', 'slot-3', 'free']);
    expect(planFor({ t: 'cast', caster: 'hero', spell: 'misty-step', slot: 3, targets: [] }, ctx())?.spend).toBe(
      'bonus',
    );
  });

  it('for a check or save: only the roll', () => {
    const plan = planFor({ t: 'rollCheck', token: 'hero', ability: 'dex', skill: 'stealth' }, ctx())!;
    expect(plan).toMatchObject({ what: { kind: 'check', name: 'Stealth' }, crit: false, damage: false });
    expect(plan.ask).toEqual({ kind: 'check', token: 'hero', ability: 'dex', skill: 'stealth' });
    expect(plan.spend).toBeUndefined();
    const save = planFor({ t: 'rollCheck', token: 'hero', ability: 'wis', save: true } as ClientMessage, ctx())!;
    expect(save.what).toMatchObject({ kind: 'save', name: 'WIS' });
  });

  it('for a feature: what it spends, and nothing when there is nothing to pick', () => {
    expect(planFor({ t: 'feature', token: 'hero', feature: 'second-wind' }, ctx())).toMatchObject({
      what: { kind: 'feature', name: 'Second Wind' },
      spend: 'bonus',
    });
    expect(planFor({ t: 'feature', token: 'hero', feature: 'second-wind' }, ctx(false))).toBeUndefined();
    expect(planFor({ t: 'feature', token: 'hero', feature: 'lore' }, ctx())).toBeUndefined();
    expect(planFor({ t: 'endTurn' }, ctx())).toBeUndefined();
  });
});

describe('the message once picked', () => {
  const plan = planFor(swing, ctx())!;

  it('is the action unchanged when nothing was changed', () => {
    expect(pickedMessage(plan, { d20: 'normal', spend: 'action' }, 'normal')).toEqual(swing);
  });

  it('says only what differs from the defaults', () => {
    expect(
      pickedMessage(
        plan,
        { d20: 'advantage', spend: 'bonus', crit: 'crit', situational: ' +2 ', damageExtra: '1d6', damageSet: 9 },
        'disadvantage',
      ),
    ).toEqual({
      ...swing,
      d20: 'advantage',
      spend: 'bonus',
      crit: 'crit',
      situational: '+2',
      damageExtra: '1d6',
      damageSet: 9,
    });
  });

  it('turns a quick pick sent with the action into the d20 picked, or drops it', () => {
    const edged = planFor({ ...swing, edge: 'advantage' }, ctx())!;
    expect(pickedMessage(edged, { d20: 'advantage' }, 'normal')).toEqual({ ...swing, d20: 'advantage' });
    expect(pickedMessage(edged, { d20: 'normal' }, 'normal')).toEqual(swing);
  });

  it('pays for a cast with what was picked', () => {
    const cast: ClientMessage = { t: 'cast', caster: 'hero', spell: 'burning-hands', slot: 1, targets: ['goblin'] };
    const burn = planFor(cast, ctx())!;
    const [, third, free] = burn.payments!;
    expect(pickedMessage(burn, { payment: third }, undefined)).toEqual({ ...cast, slot: 3 });
    expect(pickedMessage(burn, { payment: free }, undefined)).toEqual({ ...cast, free: true });
  });
});
