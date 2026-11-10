import type { Rng } from '@vtt/shared';
import { checkBonus, rollCheck } from './checks.ts';
import type { Creature } from './creature.ts';
import { rollSave, type SaveRoll } from './effects.ts';
import { abilityMod } from './creature-math.ts';
import type { Token } from './token-schema.ts';

// Grappling and shoving. 2014: the attacker's Strength (Athletics) check
// against the target's Athletics or Acrobatics, whichever is better. 2024:
// the target saves with Strength or Dexterity against 8 + the attacker's
// Strength modifier + proficiency.

interface Side {
  token: Pick<Token, 'stats'>;
  sheet: Creature;
}

const ATHLETICS = { ability: 'str', skill: 'athletics' } as const;
const ACROBATICS = { ability: 'dex', skill: 'acrobatics' } as const;

function contested(attacker: Side, target: Side, rng: Rng): SaveRoll {
  const theirs = rollCheck(attacker.token, attacker.sheet, ATHLETICS, rng);
  const bonus = (check: typeof ATHLETICS | typeof ACROBATICS) => checkBonus(target.token, target.sheet, check);
  const with_ = bonus(ACROBATICS) > bonus(ATHLETICS) ? ACROBATICS : ATHLETICS;
  const mine = rollCheck(target.token, target.sheet, with_, rng);
  return {
    ability: with_.ability,
    dc: theirs.total,
    roll: mine.roll,
    total: mine.total,
    success: mine.total >= theirs.total,
    check: true,
  };
}

function saved(attacker: Side, target: Side, rng: Rng): SaveRoll {
  const dc = 8 + abilityMod(attacker.sheet.abilities.str) + attacker.sheet.proficiency;
  const ability = target.sheet.saves.dex > target.sheet.saves.str ? 'dex' : 'str';
  return rollSave(target.sheet, ability, dc, rng);
}

/** The target's roll to resist a grapple or shove, by the attacker's edition; `success` means it resisted. */
export function grappleSave(attacker: Side, target: Side, rng: Rng = Math.random): SaveRoll {
  return attacker.sheet.edition === '2024' ? saved(attacker, target, rng) : contested(attacker, target, rng);
}
