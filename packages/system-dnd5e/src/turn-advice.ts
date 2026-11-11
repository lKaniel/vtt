import { type GridKind, isParty, roll } from '@vtt/shared';
import { attackRange, tokenDistance } from './attack.ts';
import type { Creature } from './creature.ts';
import type { Attack } from './stats-schema.ts';
import type { Token } from './token-schema.ts';

// The GM's turn helper: on a creature's turn, which of its attacks to make
// at which foe. Every attack is weighed against every foe standing on its
// feet that it reaches from where it stands or after walking with the
// movement it has left: the chance to hit against the foe's armour, the
// average damage after resistances, times its attacks per action, and a
// hit that would drop the foe counts for more. Foes are the other side
// (the party against everyone else). The table shows it; nothing happens
// until the GM takes it.

/** A creature on the map with its sheet, as the GM sees it. */
export type AdviceFighter = Pick<Token, 'id' | 'name' | 'x' | 'y' | 'size' | 'ownership'> & { sheet: Creature };

export interface AdviceScene {
  gridSize: number;
  grid: GridKind;
  /** Feet the creature may still walk this turn. */
  walk: number;
}

export interface TurnAdvice {
  attack: string;
  target: string;
  /** 0 to 1, per attack. */
  hitChance: number;
  /** Average damage this turn, all its attacks counted. */
  expected: number;
  /** One hit on average is enough to drop the target. */
  drops: boolean;
  /** It walks into reach first. */
  walks: boolean;
}

/** A d20 plus `toHit` against `ac`: a natural 1 misses and a natural 20 hits. */
export function hitChance(toHit: number, ac: number): number {
  return Math.min(0.95, Math.max(0.05, (21 - (ac - toHit)) / 20));
}

const lowest = () => 0;
const highest = () => 1 - 1e-9;

/** A dice formula's average: halfway between its lowest and highest roll. */
function averageOf(dice: string): number {
  return (roll(dice, lowest).total + roll(dice, highest).total) / 2;
}

type Defences = Pick<Creature, 'resistances' | 'immunities' | 'vulnerabilities'>;

/** An attack's average damage on a hit against `target`. */
export function averageDamage(attack: Attack, target: Defences): number {
  return attack.damage.reduce((sum, d) => {
    if (target.immunities.includes(d.type)) return sum;
    let amount = averageOf(d.dice) * (d.times ?? 1);
    if (target.resistances.includes(d.type)) amount /= 2;
    if (target.vulnerabilities.includes(d.type)) amount *= 2;
    return sum + amount;
  }, 0);
}

/** How much a hit that drops the foe is worth over its damage. */
const DROP_BONUS = 10;

/** How `attack` at `foe` goes: undefined when out of reach even after walking. */
function weigh(me: AdviceFighter, attack: Attack, foe: AdviceFighter, scene: AdviceScene): TurnAdvice | undefined {
  const feet = tokenDistance(me, foe, scene.gridSize, scene.grid);
  const here = attackRange(attack, feet);
  const walks = here === 'out' && attack.kind === 'melee' && feet - scene.walk <= (attack.reach ?? 5);
  if (here === 'out' && !walks) return undefined;
  const chance = hitChance(attack.toHit, foe.sheet.ac);
  const p = here === 'long' ? chance * chance : chance;
  const perHit = averageDamage(attack, foe.sheet);
  const left = foe.sheet.hp + foe.sheet.tempHp;
  return {
    attack: attack.name,
    target: foe.id,
    hitChance: p,
    expected: p * perHit * Math.max(1, me.sheet.attacksPerAction),
    drops: perHit >= left,
    walks,
  };
}

const score = (a: TurnAdvice) => a.expected + (a.drops ? DROP_BONUS * a.hitChance : 0) - (a.walks ? 0.01 : 0);

/** The attack and foe `me` does best with this turn; undefined when no foe is in reach. */
export function adviseTurn(
  me: AdviceFighter,
  others: readonly AdviceFighter[],
  scene: AdviceScene,
): TurnAdvice | undefined {
  const side = isParty(me);
  const foes = others.filter((o) => o.id !== me.id && isParty(o) !== side && o.sheet.hp > 0);
  const options = me.sheet.attacks.flatMap((a) => foes.map((f) => weigh(me, a, f, scene)));
  return options
    .filter((o): o is TurnAdvice => !!o && o.expected > 0)
    .reduce<TurnAdvice | undefined>((best, o) => (!best || score(o) > score(best) ? o : best), undefined);
}
