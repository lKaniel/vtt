import { type Attack, type FeatureSheet, srdFor, type TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { attackArt, diceArt, featureArt, itemArt, cutoutOf, portraitOf, spellArt } from './icon-art.ts';

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

  it('paints basic actions and their bonus-action versions with the action icons', () => {
    expect(featureArt(feature('dodge'))).toBe('/art/icons/actions/dodge.webp');
    expect(featureArt(feature('dash'))).toBe('/art/icons/actions/dash.webp');
    expect(featureArt(feature('cunning-disengage'))).toBe('/art/icons/actions/disengage.webp');
  });

  it('borrows the closest painting for features without their own', () => {
    expect(featureArt(feature('patient-defense'))).toBe('/art/icons/actions/dodge.webp');
    expect(featureArt(feature('step-of-the-wind'))).toBe('/art/icons/actions/dash.webp');
    expect(featureArt(feature('turn-undead'))).toBe('/art/icons/features/channel-divinity.webp');
    expect(featureArt(feature('paladins-smite'))).toBe('/art/icons/features/divine-smite.webp');
  });

  it('finds weapons, armour and gear by item id', () => {
    expect(itemArt(item('longsword'))).toBe('/art/icons/items/longsword.webp');
    expect(itemArt(item('potion-of-healing'))).toBe('/art/icons/items/potion-of-healing.webp');
    expect(itemArt(undefined)).toBeUndefined();
  });

  it('paints each die, with percentile dice shown as a d10', () => {
    expect(diceArt('d20')).toBe('/art/icons/dice/d20.webp');
    expect(diceArt('d100')).toBe('/art/icons/dice/d10.webp');
  });

  it("shows a token's own picture, or a hooded stranger when it has none", () => {
    expect(portraitOf({ img: '/assets/orrin.png' } as TokenView)).toBe('/assets/orrin.png');
    expect(portraitOf({} as TokenView)).toBe('/art/ui/portrait-default.webp');
  });

  it("falls back to the monster's painted token, but the token's own picture wins", () => {
    expect(portraitOf({ art: '/art/tokens/goblin.webp' } as TokenView)).toBe('/art/tokens/goblin.webp');
    expect(portraitOf({ img: '/a.png', art: '/art/tokens/goblin.webp' } as TokenView)).toBe('/a.png');
  });

  it('draws only real pictures as cut-outs; the hooded stranger stays in a round frame', () => {
    expect(cutoutOf({ art: '/art/tokens/wolf.webp' } as TokenView)).toBe('/art/tokens/wolf.webp');
    expect(cutoutOf({ img: '/a.png' } as TokenView)).toBe('/a.png');
    expect(cutoutOf({} as TokenView)).toBeUndefined();
  });
});
