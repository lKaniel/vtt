import type { Creature } from './creature.ts';
import { diceText, type GridKind, type Lattice, latticeOf, type Rng, roll, type Roll } from '@vtt/shared';
import { d20Formula } from './effects.ts';
import {
  chosenCrit,
  type CritChoice,
  type RollChoice,
  type RollEdge,
  withDamageExtra,
  withPick,
} from './roll-choice.ts';
import type { Effect } from './spell-schema.ts';
import type { Attack, Damage, DamageType } from './stats-schema.ts';

export interface AttackOptions {
  advantage?: boolean;
  disadvantage?: boolean;
  /** Dice added to the d20, e.g. "1d4" for bless. */
  bonus?: readonly string[];
  /** A hit is a critical hit (the target is paralyzed or unconscious and within 5 ft). */
  autoCrit?: boolean;
  /** The lowest d20 face that is a critical hit (20 unless a feature widens it). */
  critRange?: number;
  /** Damage added on a hit: sneak attack, rage. */
  extraDamage?: readonly Damage[];
  /** The roller's own advantage or disadvantage, on top of the effects'. */
  edge?: RollEdge;
  /** The roller's pick: a hit is a critical hit, or never one. */
  crit?: CritChoice;
  /** The rest of the roller's pick (the roll dialog): the d20 as picked, a situational modifier, extra damage. */
  pick?: RollChoice;
}

export interface AttackRoll {
  d20: Roll;
  /** The d20 face that counted. */
  natural: number;
  total: number;
  hit: boolean;
  crit: boolean;
  /** Damage rolls, empty on a miss. */
  damage: { roll: Roll; type: DamageType }[];
}

/** Doubles every die in a damage formula for a critical hit: "1d8+3" becomes "2d8+3". */
export function critDice(formula: string): string {
  const terms = diceText(formula)
    .replace(/\s+/g, '')
    .split(/(?=[+-])/);
  return terms.map(doubleTerm).join('');
}

const DICE_TERM = /^([+-]?)(\d*)d(\d+)$/;

function doubleTerm(term: string): string {
  const m = DICE_TERM.exec(term);
  if (!m) return term;
  const count = m[2] ? Number(m[2]) : 1;
  return `${m[1]}${2 * count}d${m[3]}`;
}

/** A damage roll multiplied by its part's `times`, rounded down (an illusion striking with half a bolt). */
const scaled = (r: Roll, times: number | undefined): Roll =>
  times === undefined || times === 1 ? r : { ...r, total: Math.floor(r.total * times) };

const rollParts = (parts: readonly Damage[], crit: boolean, rng: Rng) =>
  parts.map((d) => ({ roll: scaled(roll(crit ? critDice(d.dice) : d.dice, rng), d.times), type: d.type }));

/** Adamantine armor turns critical hits into normal hits. */
const critProof = (target: Creature) => target.effects.some((e) => e.noCrits);

/** Rolls an attack against a target: a 20 always hits and crits, a 1 always misses. */
export function rollAttack(attack: Attack, target: Creature, opts: AttackOptions, rng: Rng = Math.random): AttackRoll {
  const pick: RollChoice = { edge: opts.edge, crit: opts.crit, ...opts.pick };
  const edged = withPick({ advantage: !!opts.advantage, disadvantage: !!opts.disadvantage, bonus: opts.bonus }, pick);
  const d20 = roll(d20Formula(attack.toHit, edged.bonus ?? [], edged), rng);
  const natural = d20.terms[0]!.value;
  const critical = natural >= (opts.critRange ?? 20);
  const hit = critical || (natural !== 1 && d20.total >= target.ac);
  const crit = chosenCrit({ hit, crit: (critical || !!opts.autoCrit) && !critProof(target) }, pick.crit);
  const parts = withDamageExtra([...attack.damage, ...(opts.extraDamage ?? [])], pick);
  const damage = hit ? rollParts(parts, crit, rng) : [];
  return { d20, natural, total: d20.total, hit, crit, damage };
}

/** Damage after resistance (half, rounded down), vulnerability (double) and immunity (none). */
function adjustedDamage(
  target: Pick<Creature, 'immunities' | 'resistances' | 'vulnerabilities'>,
  amount: number,
  type: DamageType,
): number {
  if (target.immunities.includes(type)) return 0;
  let out = Math.max(0, amount);
  if (target.resistances.includes(type)) out = Math.floor(out / 2);
  if (target.vulnerabilities.includes(type)) out *= 2;
  return out;
}

type Struck = Pick<Creature, 'hp' | 'tempHp' | 'immunities' | 'resistances' | 'vulnerabilities'> &
  Partial<Pick<Creature, 'effects'>>;

/** The ward that takes a roll off this damage (2024 resistance), unless it was used this turn. */
function wardFor(target: Struck, parts: readonly { type: DamageType }[]): Effect | undefined {
  return target.effects?.find((e) => e.ward && !e.wardUsed && parts.some((p) => e.ward!.types.includes(p.type)));
}

/** Damage after a ward's roll comes off the first part of a type it wards. */
function wardedParts(
  parts: readonly { amount: number; type: DamageType }[],
  ward: Effect | undefined,
  rng: Rng | undefined,
): { amount: number; type: DamageType }[] {
  if (!ward || !rng) return [...parts];
  const at = parts.findIndex((p) => ward.ward!.types.includes(p.type));
  const off = roll(ward.ward!.dice, rng).total;
  return parts.map((p, i) => (i === at ? { ...p, amount: Math.max(0, p.amount - off) } : p));
}

/**
 * Applies damage to a creature, temporary hit points first; returns what each
 * part dealt and what's left. With `rng`, a ward on the creature (2024
 * resistance) takes its roll off first, and `warded` names it.
 */
export function applyDamage(
  target: Struck,
  parts: readonly { amount: number; type: DamageType }[],
  rng?: Rng,
): { dealt: number[]; hp: number; tempHp: number; warded?: string } {
  const ward = rng ? wardFor(target, parts) : undefined;
  const dealt = wardedParts(parts, ward, rng).map((p) => adjustedDamage(target, p.amount, p.type));
  const total = dealt.reduce((sum, d) => sum + d, 0);
  const absorbed = Math.min(target.tempHp, total);
  return {
    dealt,
    hp: Math.max(0, target.hp - (total - absorbed)),
    tempHp: target.tempHp - absorbed,
    ...(ward && { warded: ward.id }),
  };
}

interface Placed {
  x: number;
  y: number;
  size: number;
}

/**
 * Feet between two tokens. On squares: between their nearest squares, every
 * square (diagonals too) 5 ft. On hexes: the hexes between their centres,
 * less what a large creature covers. Without a grid: the ground between
 * their edges plus 5 ft for the target's own space, less half a square of
 * slack, so creatures standing within a step of each other are 5 ft apart.
 */
export function tokenDistance(a: Placed, b: Placed, gridSize: number, grid: GridKind = 'square'): number {
  if (grid === 'none') {
    const gap = Math.hypot(a.x - b.x, a.y - b.y) - ((a.size + b.size) / 2) * gridSize;
    return 5 + Math.round(Math.max(0, (gap / gridSize) * 5 - 2.5));
  }
  if (grid !== 'square') return hexDistance(a, b, latticeOf(grid, gridSize));
  const half = ((a.size + b.size) / 2) * gridSize;
  const gap = (d: number) => Math.round(Math.max(0, Math.abs(d) - half) / gridSize);
  return (Math.max(gap(a.x - b.x), gap(a.y - b.y)) + 1) * 5;
}

/** Hexes between two tokens' centres, less the hexes a creature larger than one covers around its centre. */
function hexDistance(a: Placed, b: Placed, hex: Lattice): number {
  const cells = hex.distance(hex.cellOf([a.x, a.y]), hex.cellOf([b.x, b.y]));
  const spread = (t: Placed) => Math.ceil((t.size - 1) / 2);
  return Math.max(1, cells - spread(a) - spread(b)) * 5;
}

/** Whether a target this many feet away is within normal range, long range or out of reach. */
export function attackRange(attack: Attack, feet: number): 'normal' | 'long' | 'out' {
  if (attack.kind === 'melee') return feet <= (attack.reach ?? 5) ? 'normal' : 'out';
  const [normal, long] = attack.range ?? [5, 5];
  if (feet <= normal) return 'normal';
  return feet <= long ? 'long' : 'out';
}
