import { srdFor, type Attack, type FeatureSheet } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { attackArt, featureArt, spellArt } from './icon-art.ts';

const spell = (id: string) => srdFor('2014').spells.get(id)!;
const attack = (kind: Attack['kind']): Attack => ({
  name: 'X',
  kind,
  toHit: 0,
  damage: [{ dice: '1', type: 'slashing' }],
});
const feature = (id: string) => ({ id }) as FeatureSheet;

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
});
