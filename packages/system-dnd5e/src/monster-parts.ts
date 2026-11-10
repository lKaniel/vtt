import { roll, type Rng } from '@vtt/shared';
import type { Creature } from './creature.ts';
import type { Monster } from './monster-schema.ts';
import type { Feature } from './spell-schema.ts';
import type { Token } from './token-schema.ts';

// What a monster's stat block gives besides numbers and attacks: its other
// speeds, its skills, and actions that recharge on a d6.

/** The creature's speeds with the stat block's own: the faster of each, hovering if either does. */
export function withMonsterSpeeds(speeds: Creature['speeds'], monster: Monster | undefined): Creature['speeds'] {
  const own = monster?.speeds;
  if (!own) return speeds;
  const out: NonNullable<Creature['speeds']> = { ...speeds };
  for (const kind of ['fly', 'swim', 'climb'] as const) {
    const feet = Math.max(out[kind] ?? 0, own[kind] ?? 0);
    if (feet) out[kind] = feet;
  }
  if (own.hover) out.hover = true;
  return out;
}

/** The actions of its stat block the engine runs like class features (breath weapons). */
export const monsterFeatures = (monster: Monster | undefined): Feature[] => monster?.features ?? [];

/** The skills the stat block is proficient in, and those with expertise, when it lists any. */
export function monsterSkills(monster: Monster | undefined): Pick<Creature, 'skills' | 'expertise'> {
  return {
    ...(monster?.skills && { skills: monster.skills }),
    ...(monster?.expertise && { expertise: monster.expertise }),
  };
}

export interface Recharged {
  token: Token;
  /** What came back, for the log. */
  notes: string[];
}

/** Rolls a d6 for each spent "Recharge 5-6" action as the creature's turn starts; it comes back on that or more. */
export function rechargeFeatures(token: Token, sheet: Pick<Creature, 'features'>, rng: Rng): Recharged {
  const notes: string[] = [];
  const back = new Set<string>();
  for (const f of sheet.features) {
    if (!f.rechargeOn || !token.spent?.uses?.[f.id]) continue;
    const rolled = roll('1d6', rng).total;
    if (rolled < f.rechargeOn) continue;
    back.add(f.id);
    notes.push(`${token.name} recharges ${f.name} (rolled ${rolled})`);
  }
  if (!back.size) return { token, notes };
  const left = Object.entries(token.spent?.uses ?? {}).filter(([id]) => !back.has(id));
  const uses = left.length ? Object.fromEntries(left) : undefined;
  return { token: { ...token, spent: { ...token.spent, uses } }, notes };
}
