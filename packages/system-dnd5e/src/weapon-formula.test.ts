import { describe, expect, it } from 'vitest';
import { damageText, formulaDamage, formulaHit, typedDamage, weaponFormulaProblem } from './weapon-formula.ts';

// A homemade weapon written as formulas: its damage as typed dice and
// numbers, its attack roll as numbers, both reading the wielder's ability
// modifiers, proficiency and level.

const vars = { str: 1, dex: 4, con: 2, int: 0, wis: -1, cha: 3, mod: 4, prof: 3, level: 5 };

describe('weapon damage formulas', () => {
  it('splits typed dice into parts and adds the numbers to the first', () => {
    expect(
      formulaDamage('1d10 psychic + 1d12 piercing + 2d20 fire + 2*dex + 5 + proficiency', 'slashing', vars),
    ).toEqual([
      { dice: '1d10+16', type: 'psychic' },
      { dice: '1d12', type: 'piercing' },
      { dice: '2d20', type: 'fire' },
    ]);
  });

  it("takes the weapon's own damage type for dice without one, and subtracts", () => {
    expect(formulaDamage('2d6 + mod - 1', 'slashing', vars)).toEqual([{ dice: '2d6+3', type: 'slashing' }]);
    expect(formulaDamage('1d4 + wis', 'bludgeoning', vars)).toEqual([{ dice: '1d4-1', type: 'bludgeoning' }]);
    expect(formulaDamage('1d8 + 1d6 cold + str', 'slashing', vars)).toEqual([
      { dice: '1d8+1', type: 'slashing' },
      { dice: '1d6', type: 'cold' },
    ]);
  });

  it('reads brackets, level, a flat typed number and dice typed on a Ukrainian layout', () => {
    expect(formulaDamage('1в6 fire + (level + 1) / 2', 'slashing', vars)).toEqual([{ dice: '1d6+3', type: 'fire' }]);
    expect(formulaDamage('1d8 + 3 radiant', 'slashing', vars)).toEqual([
      { dice: '1d8', type: 'slashing' },
      { dice: '3', type: 'radiant' },
    ]);
  });

  it('says what it cannot read', () => {
    expect(weaponFormulaProblem('1d8 + luck', 'damage')).toMatch(/luck/);
    expect(weaponFormulaProblem('1d8 frost', 'damage')).toMatch(/frost/);
    expect(weaponFormulaProblem('1d8 +', 'damage')).toBeDefined();
    expect(weaponFormulaProblem('1d10 psychic + 2*dex + prof', 'damage')).toBeUndefined();
    expect(weaponFormulaProblem('1d20', 'hit')).toMatch(/dice/);
  });
});

describe('weapon attack formulas', () => {
  it('works out the attack bonus', () => {
    expect(formulaHit('dex + prof + 2', vars)).toBe(9);
    expect(formulaHit('cha + level', vars)).toBe(8);
    expect(weaponFormulaProblem('dex + prof', 'hit')).toBeUndefined();
  });
});

describe('typed damage', () => {
  it('reads damage that names a type for every part, and writes it back', () => {
    const damage = typedDamage('2d6 poison + 1d4+1 acid');
    expect(damage).toEqual([
      { dice: '2d6', type: 'poison' },
      { dice: '1d4+1', type: 'acid' },
    ]);
    expect(damageText(damage)).toBe('2d6 poison + 1d4+1 acid');
    expect(() => typedDamage('2d6')).toThrow(/type/);
    expect(() => typedDamage('2d6 poison + dex')).toThrow(/dex/);
  });
});
