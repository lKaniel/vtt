import { srdFor, type Attack, type FeatureSheet, type TokenView, type TurnBudget } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { actionTiles, affordable, costOf, filterTiles } from './actions.ts';

const spell = (id: string) => srdFor('2014').spells.get(id)!;

const staff: Attack = {
  name: 'Quarterstaff',
  kind: 'melee',
  toHit: 1,
  damage: [{ dice: '1d6-1', type: 'bludgeoning' }],
};
const rage: FeatureSheet = { id: 'rage', name: 'Rage', level: 1, description: '', recharge: 'long', action: 'bonus' };
const passive: FeatureSheet = {
  id: 'unarmored',
  name: 'Unarmored Defense',
  level: 1,
  description: '',
  recharge: 'long',
};

function wizard(): TokenView {
  return {
    id: 'orrin',
    name: 'Orrin',
    x: 0,
    y: 0,
    size: 1,
    color: '#38f',
    speed: 30,
    controllers: [],
    darkvision: 0,
    hidden: false,
    sheet: {
      attacks: [staff],
      features: [rage, passive],
      caster: { spells: [spell('shield'), spell('fire-bolt'), spell('magic-missile')], left: [0, 1], slots: [2, 1] },
    } as unknown as TokenView['sheet'],
  };
}

const budget = (b: Partial<TurnBudget>): TurnBudget => ({
  move: 30,
  action: true,
  bonus: true,
  attacks: 0,
  used: [],
  ...b,
});

describe('action bar tiles', () => {
  it('lists attacks, then spells by level, then features you can use, each with a hotkey', () => {
    const tiles = actionTiles(wizard());
    expect(tiles.map((t) => t.name)).toEqual(['Quarterstaff', 'Fire Bolt', 'Magic Missile', 'Shield', 'Rage']);
    expect(tiles.map((t) => t.hotkey)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('casts a spell with its lowest slot left, and marks it spent when there is none', () => {
    const tiles = actionTiles(wizard());
    expect(tiles.find((t) => t.name === 'Magic Missile')).toMatchObject({ kind: 'spell', slot: 2, spent: false });
    const token = wizard();
    token.sheet!.caster!.left = [0, 0];
    expect(actionTiles(token).find((t) => t.name === 'Shield')).toMatchObject({ slot: undefined, spent: true });
  });

  it('marks features with no uses left as spent', () => {
    const token = wizard();
    token.sheet!.features = [{ ...rage, max: 2, left: 0 }];
    expect(actionTiles(token).at(-1)).toMatchObject({ kind: 'feature', spent: true, uses: '0/2' });
  });

  it('gives only the first ten tiles a hotkey', () => {
    const token = wizard();
    token.sheet!.attacks = Array.from({ length: 12 }, (_, i) => ({ ...staff, name: `Attack ${i}` }));
    const keys = actionTiles(token).map((t) => t.hotkey);
    expect(keys.slice(8, 11)).toEqual(['9', '0', undefined]);
  });

  it('uses painted art where there is some', () => {
    const [attack, bolt, , , rage] = actionTiles(wizard());
    expect(attack!.icon.art).toBe('/art/icons/actions/melee-attack.webp');
    expect(bolt!.icon.art).toBe('/art/icons/spells/fire-bolt.webp');
    expect(rage!.icon.art).toBe('/art/icons/features/rage.webp');
  });

  it('filters by tab', () => {
    const tiles = actionTiles(wizard());
    expect(filterTiles(tiles, 'all')).toHaveLength(5);
    expect(filterTiles(tiles, 'attacks').map((t) => t.name)).toEqual(['Quarterstaff']);
    expect(filterTiles(tiles, 'spells')).toHaveLength(3);
    expect(filterTiles(tiles, 'features').map((t) => t.name)).toEqual(['Rage']);
  });
});

describe('what an action costs', () => {
  it('reads the cost from the attack, casting time or feature', () => {
    const [attack, bolt, , shield, feature] = actionTiles(wizard());
    expect(costOf(attack!)).toBe('action');
    expect(costOf(bolt!)).toBe('action');
    expect(costOf(shield!)).toBe('reaction');
    expect(costOf(feature!)).toBe('bonus');
  });

  it('makes an off-hand attack a bonus action', () => {
    const [attack] = actionTiles(wizard());
    if (attack?.kind !== 'attack') throw new Error('expected an attack tile');
    const offHand = { ...attack, attack: { ...attack.attack, offHand: true } };
    expect(costOf(offHand)).toBe('bonus');
    expect(affordable(offHand, budget({ action: false, attacks: 0 }))).toBe(true);
  });

  it('is always affordable outside your turn', () => {
    const [attack] = actionTiles(wizard());
    expect(affordable(attack!, undefined)).toBe(true);
  });

  it('needs the action or bonus action left on your turn', () => {
    const [attack, bolt, , , feature] = actionTiles(wizard());
    expect(affordable(bolt!, budget({ action: false }))).toBe(false);
    expect(affordable(feature!, budget({ bonus: false }))).toBe(false);
    expect(affordable(feature!, budget({ action: false }))).toBe(true);
    // An Attack action already begun leaves extra attacks.
    expect(affordable(attack!, budget({ action: false, attacks: 1 }))).toBe(true);
  });
});
