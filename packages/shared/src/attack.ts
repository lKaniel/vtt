import type { Creature } from './creature.ts';
import { roll, type Rng, type Roll } from './dice.ts';
import type { Attack, DamageType } from './stats-schema.ts';

export interface AttackOptions {
  advantage?: boolean;
  disadvantage?: boolean;
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
  const terms = formula.replace(/\s+/g, '').split(/(?=[+-])/);
  return terms.map(doubleTerm).join('');
}

const DICE_TERM = /^([+-]?)(\d*)d(\d+)$/;

function doubleTerm(term: string): string {
  const m = DICE_TERM.exec(term);
  if (!m) return term;
  const count = m[2] ? Number(m[2]) : 1;
  return `${m[1]}${2 * count}d${m[3]}`;
}

function d20Formula(toHit: number, opts: AttackOptions): string {
  let die = '1d20';
  if (opts.advantage && !opts.disadvantage) die = '2d20kh1';
  if (opts.disadvantage && !opts.advantage) die = '2d20kl1';
  return toHit < 0 ? `${die}${toHit}` : `${die}+${toHit}`;
}

/** Rolls an attack against a target: a 20 always hits and crits, a 1 always misses. */
export function rollAttack(attack: Attack, target: Creature, opts: AttackOptions, rng: Rng = Math.random): AttackRoll {
  const d20 = roll(d20Formula(attack.toHit, opts), rng);
  const natural = d20.terms[0]!.value;
  const crit = natural === 20;
  const hit = crit || (natural !== 1 && d20.total >= target.ac);
  const damage = hit
    ? attack.damage.map((d) => ({ roll: roll(crit ? critDice(d.dice) : d.dice, rng), type: d.type }))
    : [];
  return { d20, natural, total: d20.total, hit, crit, damage };
}

/** Damage after resistance (half, rounded down), vulnerability (double) and immunity (none). */
function adjustedDamage(target: Creature, amount: number, type: DamageType): number {
  if (target.immunities.includes(type)) return 0;
  let out = Math.max(0, amount);
  if (target.resistances.includes(type)) out = Math.floor(out / 2);
  if (target.vulnerabilities.includes(type)) out *= 2;
  return out;
}

/** Applies damage to a creature; returns what each part dealt and the hit points left. */
export function applyDamage(
  target: Creature,
  parts: readonly { amount: number; type: DamageType }[],
): { dealt: number[]; hp: number } {
  const dealt = parts.map((p) => adjustedDamage(target, p.amount, p.type));
  const total = dealt.reduce((sum, d) => sum + d, 0);
  return { dealt, hp: Math.max(0, target.hp - total) };
}

interface Placed {
  x: number;
  y: number;
  size: number;
}

/** Feet between two tokens' nearest squares, every square (diagonals too) 5 ft. */
export function tokenDistance(a: Placed, b: Placed, gridSize: number): number {
  const half = ((a.size + b.size) / 2) * gridSize;
  const gap = (d: number) => Math.round(Math.max(0, Math.abs(d) - half) / gridSize);
  return (Math.max(gap(a.x - b.x), gap(a.y - b.y)) + 1) * 5;
}

/** Whether a target this many feet away is within normal range, long range or out of reach. */
export function attackRange(attack: Attack, feet: number): 'normal' | 'long' | 'out' {
  if (attack.kind === 'melee') return feet <= (attack.reach ?? 5) ? 'normal' : 'out';
  const [normal, long] = attack.range ?? [5, 5];
  if (feet <= normal) return 'normal';
  return feet <= long ? 'long' : 'out';
}
