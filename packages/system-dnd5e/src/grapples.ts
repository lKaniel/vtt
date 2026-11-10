import type { Rng } from '@vtt/shared';
import { checkBonus, rollCheck } from './checks.ts';
import type { Creature } from './creature.ts';
import { rollSave, type SaveRoll } from './effects.ts';
import type { Effect } from './spell-schema.ts';
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

/** The grapples a creature is held in: its effects that leave it grappled. */
export function grapplesOn(token: Pick<Token, 'effects'>): Effect[] {
  return (token.effects ?? []).filter((e) => e.conditions?.includes('grappled'));
}

/** Its better escape check: Strength (Athletics) or Dexterity (Acrobatics). */
function escapeCheck(self: Side): typeof ATHLETICS | typeof ACROBATICS {
  const bonus = (check: typeof ATHLETICS | typeof ACROBATICS) => checkBonus(self.token, self.sheet, check);
  return bonus(ACROBATICS) > bonus(ATHLETICS) ? ACROBATICS : ATHLETICS;
}

/**
 * A grappled creature's try to break free; `success` means it escaped. Its
 * Athletics or Acrobatics against the grapple's escape DC: the stat block's,
 * else 8 + the grappler's Strength modifier + proficiency (2024), else a
 * contest with the grappler's Athletics (2014); 10 when the grappler is gone.
 */
export function escapeRoll(self: Side, grapple: Effect, grappler: Side | undefined, rng: Rng = Math.random): SaveRoll {
  const check = escapeCheck(self);
  const mine = rollCheck(self.token, self.sheet, check, rng);
  const dc = escapeDc(grapple, grappler, rng);
  return { ability: check.ability, dc, roll: mine.roll, total: mine.total, success: mine.total >= dc, check: true };
}

function escapeDc(grapple: Effect, grappler: Side | undefined, rng: Rng): number {
  if (grapple.escape) return grapple.escape;
  if (!grappler) return 10;
  if (grappler.sheet.edition !== '2024') return rollCheck(grappler.token, grappler.sheet, ATHLETICS, rng).total;
  return 8 + abilityMod(grappler.sheet.abilities.str) + grappler.sheet.proficiency;
}

/**
 * How many feet each foot of a grappler's walk costs: double while it drags a
 * creature, unless every one it drags is two or more sizes smaller.
 */
export function dragCost(grappler: Pick<Token, 'size'>, dragged: readonly Pick<Token, 'size'>[]): number {
  return dragged.some((d) => grappler.size - d.size < 2) ? 2 : 1;
}
