import { srdFor, type Attack, type FeatureSheet, type TokenView } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { attackArt, diceArt, featureArt, itemArt, portraitOf, spellArt, tokenBaseArt } from './icon-art.ts';

const spell = (id: string) => srdFor('2014').spells.get(id)!;
const attack = (kind: Attack['kind']): Attack => ({
  name: 'X',
  kind,
  toHit: 0,
  damage: [{ dice: '1', type: 'slashing' }],
});
const feature = (id: string) => ({ id }) as FeatureSheet;
const item = (id: string) => srdFor('2014').items.get(id);

describe('painted icon art', () => {
  it('finds a spell painting by id', () => {
    expect(spellArt(spell('fireball'))).toBe('/art/icons/spells/fireball.webp');
    expect(spellArt(spell('wish'))).toBeUndefined();
  });

  it('paints attacks as melee or ranged', () => {
    expect(attackArt(attack('melee'))).toBe('/art/icons/actions/melee-attack.webp');
    expect(attackArt(attack('ranged'))).toBe('/art/icons/actions/ranged-attack.webp');
  });

  it('finds class features by id', () => {
    expect(featureArt(feature('second-wind'))).toBe('/art/icons/features/second-wind.webp');
    expect(featureArt(feature('arcane-recovery'))).toBeUndefined();
  });

  it('finds weapons, armour and gear by item id', () => {
    expect(itemArt(item('longsword'))).toBe('/art/icons/items/longsword.webp');
    expect(itemArt(item('potion-of-healing'))).toBe('/art/icons/items/potion-of-healing.webp');
    expect(itemArt(undefined)).toBeUndefined();
  });

  it('stands party tokens on blue bases, others on red, and the selected one on gold', () => {
    const party = { controllers: ['p1'] } as TokenView;
    const monster = { controllers: [] as string[] } as TokenView;
    expect(tokenBaseArt(party, false)).toBe('/art/ui/token-base-ally.webp');
    expect(tokenBaseArt(monster, false)).toBe('/art/ui/token-base-foe.webp');
    expect(tokenBaseArt(party, true)).toBe('/art/ui/token-base-selected.webp');
  });

  it('paints each die, with percentile dice shown as a d10', () => {
    expect(diceArt('d20')).toBe('/art/icons/dice/d20.webp');
    expect(diceArt('d100')).toBe('/art/icons/dice/d10.webp');
  });

  it("shows a token's own picture, or a hooded stranger when it has none", () => {
    expect(portraitOf({ img: '/assets/orrin.png' } as TokenView)).toBe('/assets/orrin.png');
    expect(portraitOf({} as TokenView)).toBe('/art/ui/portrait-default.svg');
  });
});
