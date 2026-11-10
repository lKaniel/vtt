import { type AttackRoll, rollAttack, tokenDistance } from './attack.ts';
import { abilityMod } from './creature-math.ts';
import { attackModifiers, rollSave, type UsedEffect } from './effects.ts';
import { type RollChoice, withEdge } from './roll-choice.ts';
import type { CastSide } from './spells.ts';
import type { Effect } from './spell-schema.ts';
import type { Attack, Damage, DamageType } from './stats-schema.ts';
import type { GridKind, Rng } from '@vtt/shared';
import { divineSmite, hitRiders, markDamage, withWeaponBonus } from './riders.ts';
import { mirrorImage, weakenedDamage } from './wards.ts';
import { critRangeOf, styleDamage } from './class-styles.ts';
import { type HitSave, hitSave } from './hit-saves.ts';

// One attack with a weapon or natural weapon, with everything that changes
// it: conditions, bless, sneak attack, rage, and 2024 weapon masteries.

export interface WeaponAttackInput {
  attacker: CastSide;
  target: CastSide;
  attack: Attack;
  range: 'normal' | 'long';
  gridSize: number;
  /** The scene's grid (default square; none: distances as the crow flies). */
  grid?: GridKind;
  /** An ally of the attacker is within 5 ft of the target (for sneak attack). */
  allyNearTarget: boolean;
  /** Spell slot spent on Divine Smite if the attack hits (2014 paladin); the server checks it's allowed. */
  smite?: number;
  /** Sneak attack was already used this turn. */
  sneakUsed: boolean;
  /** Extra damage a finisher adds if the attack hits (finishers.ts); the server spends the dice. */
  finisher?: Damage;
  /** The roller's own advantage or disadvantage, and a critical forced or held back. */
  pick?: RollChoice;
}

export interface WeaponAttackOutcome {
  roll: AttackRoll;
  /** Sneak attack dice were added. */
  sneak: boolean;
  /** Divine Smite landed, so its slot is spent. */
  smote: boolean;
  /** Damage a grazing weapon deals on a miss. */
  graze?: { amount: number; type: DamageType };
  /** Feet the push mastery moves the target away. */
  push?: number;
  /** The attack went at one of the target's mirror images: "hit" destroys it. */
  decoy?: 'hit' | 'missed';
  /** Effects the attack leaves on the target (masteries). */
  targetEffects: Effect[];
  used: UsedEffect[];
  notes: string[];
}

function canSneak(input: WeaponAttackInput, advantage: boolean, disadvantage: boolean): boolean {
  const { attacker, attack } = input;
  if (!attacker.sheet.sneakAttack || input.sneakUsed || disadvantage) return false;
  const fits = attack.kind === 'ranged' || !!attack.weapon?.properties.includes('finesse');
  return fits && (advantage || input.allyNearTarget);
}

function extraDamage(input: WeaponAttackInput, sneak: boolean): Damage[] {
  const { attacker, attack, target } = input;
  const type = attack.damage[0]!.type;
  const extra: Damage[] = [];
  const rage = attacker.sheet.effects.reduce((n, e) => n + (e.meleeDamage ?? 0), 0);
  if (rage && attack.kind === 'melee' && attack.weapon?.ability === 'str') extra.push({ dice: String(rage), type });
  if (sneak) extra.push({ dice: attacker.sheet.sneakAttack!, type });
  extra.push(...weaponRiders(attack, target.sheet.type));
  extra.push(...hitRiders({ id: attacker.token.id, sheet: attacker.sheet }, type).damage);
  extra.push(...markDamage(target.sheet, attacker.token.id, type));
  return [...extra, ...smiting(input), ...(input.finisher ? [input.finisher] : [])];
}

/** A magic weapon's own extra damage: always, or against the creature types it slays. */
function weaponRiders(attack: Attack, targetType: string): Damage[] {
  const type = attack.damage[0]!.type;
  return (attack.weapon?.hitDamage ?? [])
    .filter((r) => !r.vs || r.vs.includes(targetType))
    .map((r) => ({ dice: r.dice, type: r.type === 'weapon' ? type : r.type }));
}

/** Divine Smite on a melee hit, and Improved Divine Smite's 1d8 on every melee hit (2014 paladin). */
function smiting({ attacker, attack, target, smite }: WeaponAttackInput): Damage[] {
  if (attack.kind !== 'melee') return [];
  const improved = attacker.sheet.features.some((f) => f.id === 'improved-divine-smite');
  const out: Damage[] = smite ? [divineSmite(smite, target.sheet.type)] : [];
  return improved ? [...out, { dice: '1d8', type: 'radiant' }] : out;
}

const MASTERY_EFFECTS: Record<string, Omit<Effect, 'id' | 'source'>> = {
  sap: { name: 'Sapped', disadvantage: true, once: true, rounds: 1 },
  vex: { name: 'Vexed', advantageAgainst: true, once: true, rounds: 1 },
  slow: { name: 'Slowed', speed: -10, rounds: 1 },
};

/** Push: 10 feet away, for a Large or smaller target. */
function pushOnHit({ attacker, target, attack }: WeaponAttackInput): number | undefined {
  const pushes = attacker.sheet.weaponMastery && attack.weapon?.mastery === 'push';
  return pushes && target.token.size <= 2 ? 10 : undefined;
}

/** What the weapon's mastery does when it hits; topple needs a Con save. */
function masteryOnHit(input: WeaponAttackInput, rng: Rng): { effects: Effect[]; notes: string[] } {
  const { attacker, target, attack } = input;
  const mastery = attacker.sheet.weaponMastery ? attack.weapon?.mastery : undefined;
  const source = attacker.token.id;
  const template = mastery ? MASTERY_EFFECTS[mastery] : undefined;
  if (template) {
    const onlyFor = mastery === 'vex' ? source : undefined;
    return { effects: [{ ...template, id: `${mastery}-${source}`, source, onlyFor }], notes: [] };
  }
  if (mastery !== 'topple' || !attack.weapon) return { effects: [], notes: [] };
  const dc = 8 + abilityMod(attacker.sheet.abilities[attack.weapon.ability]) + attacker.sheet.proficiency;
  if (rollSave(target.sheet, 'con', dc, rng).success) return { effects: [], notes: [] };
  return {
    effects: [{ id: `prone-${target.token.id}`, name: 'Prone', conditions: ['prone'] }],
    notes: [`${target.token.name} is knocked prone`],
  };
}

function grazeDamage(input: WeaponAttackInput): WeaponAttackOutcome['graze'] {
  const { attacker, attack } = input;
  if (!attacker.sheet.weaponMastery || attack.weapon?.mastery !== 'graze') return undefined;
  const amount = abilityMod(attacker.sheet.abilities[attack.weapon.ability]);
  return amount > 0 ? { amount, type: attack.damage[0]!.type } : undefined;
}

/** What the attack rolls with: the effects', long range's disadvantage, and the attacker's own pick. */
function rolledModifiers(input: WeaponAttackInput, within5: boolean) {
  const mods = withEdge(attackModifiers(input.attacker, input.target, { within5 }), input.pick?.edge);
  return { ...mods, disadvantage: mods.disadvantage || input.range === 'long', crit: input.pick?.crit };
}

export function resolveWeaponAttack(input: WeaponAttackInput, rng: Rng = Math.random): WeaponAttackOutcome {
  const { attacker, target, gridSize, grid } = input;
  const attack = withWeaponBonus(input.attack, attacker.sheet);
  const within5 = tokenDistance(attacker.token, target.token, gridSize, grid) <= 5;
  const mods = rolledModifiers(input, within5);
  const { disadvantage } = mods;
  const sneak = canSneak(input, mods.advantage, disadvantage);
  const rolled = rollAttack(
    attack,
    target.sheet,
    {
      ...mods,
      critRange: critRangeOf(attacker.sheet),
      extraDamage: [...extraDamage({ ...input, attack }, sneak), ...styleDamage(attacker.sheet, attack)],
    },
    rng,
  );
  const { result, decoy, rider } = landing(input, attack, rolled, rng);
  const mastery = result.hit ? masteryOnHit(input, rng) : { effects: [], notes: [] };
  const riders = result.hit ? hitRiders({ id: attacker.token.id, sheet: attacker.sheet }, 'force').used : [];
  return {
    roll: result,
    sneak: sneak && result.hit,
    smote: !!input.smite && result.hit && attack.kind === 'melee',
    graze: result.hit || decoy ? undefined : grazeDamage(input),
    push: result.hit ? pushOnHit(input) : undefined,
    decoy,
    targetEffects: [...mastery.effects, ...rider.effects],
    used: [...mods.used, ...riders],
    notes: outcomeNotes(sneak && result.hit, [...mastery.notes, ...rider.notes], decoy),
  };
}

function outcomeNotes(sneak: boolean, mastery: string[], decoy: 'hit' | 'missed' | undefined): string[] {
  return [...(sneak ? ['sneak attack'] : []), ...mastery, ...(decoy ? [DECOY_NOTES[decoy]] : [])];
}

const DECOY_NOTES = {
  hit: 'it strikes a duplicate, which vanishes',
  missed: 'it goes at a duplicate and misses',
};

const NO_RIDER: HitSave = { damage: [], effects: [], notes: [] };

/** The rolled attack as it lands: on a mirror image instead of the target, or with weakened damage and what rides on the hit. */
function landing(
  { attacker, target }: WeaponAttackInput,
  attack: Attack,
  rolled: AttackRoll,
  rng: Rng,
): { result: AttackRoll; decoy?: 'hit' | 'missed'; rider: HitSave } {
  const decoy = mirrorImage(attacker.sheet, target.sheet, rolled, rng);
  if (decoy) return { result: { ...rolled, hit: false, crit: false, damage: [] }, decoy, rider: NO_RIDER };
  const damage = weakenedDamage(attacker.sheet, attack, rolled.damage, rng);
  if (!rolled.hit) return { result: { ...rolled, damage }, rider: NO_RIDER };
  const rider = hitSave({ attacker, target, attack, crit: rolled.crit }, rng);
  return { result: { ...rolled, damage: [...damage, ...rider.damage] }, rider };
}
