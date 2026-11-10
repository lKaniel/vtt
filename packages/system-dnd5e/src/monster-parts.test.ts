import { describe, expect, it } from 'vitest';
import { checkBonus, rechargeFeatures, resolveCreature, srdFor, TokenSchema } from './index.ts';

const token = (data: object) => TokenSchema.parse({ id: 't', name: 'Dragon', x: 50, y: 50, ...data });
const books = srdFor('2014');
/** Dice that always roll `face` on a d6. */
const rolling = (face: number) => () => (face - 0.5) / 6;

describe("a monster's stat block beyond its attacks", () => {
  const dragon = token({ monster: 'adult-red-dragon' });

  it('attacks as often as its Multiattack says', () => {
    expect(resolveCreature(dragon, books)!.attacksPerAction).toBe(3);
  });

  it('has its breath weapon as a feature aimed like a spell, with one use', () => {
    const breath = resolveCreature(dragon, books)!.features.find((f) => f.id === 'fire-breath');
    expect(breath).toMatchObject({ name: 'Fire Breath', action: 'action', max: 1, left: 1, rechargeOn: 5 });
    expect(breath!.spell).toMatchObject({ area: { shape: 'cone', size: 60 }, save: { ability: 'dex', dc: 21 } });
  });

  it('flies and climbs at the speeds of its stat block', () => {
    expect(resolveCreature(dragon, books)!.speeds).toMatchObject({ fly: 80, climb: 40 });
  });

  it('adds its proficiency to the skills of its stat block, twice with expertise', () => {
    const sheet = resolveCreature(dragon, books)!;
    // Wisdom 13 (+1), proficiency +6: Perception +13 with expertise, Stealth +6 with Dexterity 10.
    expect(checkBonus(dragon, sheet, { ability: 'wis', skill: 'perception' })).toBe(13);
    expect(checkBonus(dragon, sheet, { ability: 'dex', skill: 'stealth' })).toBe(6);
    expect(checkBonus(dragon, sheet, { ability: 'int', skill: 'arcana' })).toBe(3);
  });
});

describe('rechargeFeatures', () => {
  const spent = token({ monster: 'adult-red-dragon', spent: { uses: { 'fire-breath': 1 } } });
  const sheet = resolveCreature(spent, books)!;

  it('gives a spent use back on a d6 roll of its recharge number or more', () => {
    const out = rechargeFeatures(spent, sheet, rolling(5));
    expect(out.token.spent?.uses?.['fire-breath']).toBeUndefined();
    expect(out.notes).toEqual(['Dragon recharges Fire Breath (rolled 5)']);
    expect(resolveCreature(out.token, books)!.features.find((f) => f.id === 'fire-breath')!.left).toBe(1);
  });

  it('keeps it spent on a lower roll', () => {
    const out = rechargeFeatures(spent, sheet, rolling(4));
    expect(out.token).toBe(spent);
    expect(out.notes).toEqual([]);
  });

  it('rolls nothing while the use is still there', () => {
    const fresh = token({ monster: 'adult-red-dragon' });
    const out = rechargeFeatures(fresh, resolveCreature(fresh, books)!, () => {
      throw new Error('rolled');
    });
    expect(out.token).toBe(fresh);
  });
});
