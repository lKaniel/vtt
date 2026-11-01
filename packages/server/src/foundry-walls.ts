import type { DoorState, SenseRestriction, Wall, WallRules } from '@vtt/shared';
import { z } from 'zod';

// Foundry walls as ours. Foundry restricts movement, sight, light and sound
// separately with numbered levels (v10+: 0 none, 10 limited, 20 normal,
// 30 proximity, 40 reverse proximity; v9: 0 none, 1 normal, 2 limited).
// Missing light follows sight, as in v9 where one "sense" covered both.

const num = z.number().optional().catch(undefined);

export const FoundryWall = z.object({
  c: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  move: num,
  sight: num,
  /** v9's name for sight. */
  sense: num,
  light: num,
  sound: num,
  door: num,
  ds: num,
  /** v11+: distances (grid units) within which a proximity wall lets a sense through. */
  threshold: z.object({ sight: num, light: num, sound: num }).nullable().optional().catch(undefined),
});
export type FoundryWallData = z.infer<typeof FoundryWall>;

const DOOR_STATES: DoorState[] = ['closed', 'open', 'locked'];

/** One Foundry restriction level as ours; reverse proximity has no match and stops the sense. */
function level(n: number | undefined): SenseRestriction {
  if (n === undefined) return 'normal';
  if (n === 0) return 'none';
  if (n === 10 || n === 2) return 'limited';
  return n === 30 ? 'proximity' : 'normal';
}

const SENSES = ['sight', 'light', 'sound'] as const;

/** The restrictions that aren't the default, and thresholds of the proximity ones in feet. */
function rulesOf(w: FoundryWallData, feet: (units: number) => number): WallRules {
  const sight = w.sight ?? w.sense;
  const raw = { sight, light: w.light ?? sight, sound: w.sound };
  const rules: WallRules = w.move === 0 ? { move: 'none' } : {};
  const threshold: NonNullable<WallRules['threshold']> = {};
  for (const sense of SENSES) {
    const r = level(raw[sense]);
    if (r !== 'normal') rules[sense] = r;
    const units = w.threshold?.[sense];
    if (r === 'proximity' && units) threshold[sense] = feet(units);
  }
  if (Object.keys(threshold).length) rules.threshold = threshold;
  return rules;
}

const stopsNothing = (r: WallRules) => r.move === 'none' && SENSES.every((s) => r[s] === 'none');

/** One wall without its id, or undefined if it stops nothing. */
export function wallOf(w: FoundryWallData, feet: (units: number) => number): Omit<Wall, 'id'> | undefined {
  const rules = rulesOf(w, feet);
  if (stopsNothing(rules)) return undefined;
  const [ax, ay, bx, by] = w.c;
  const door = w.door ? { door: DOOR_STATES[w.ds ?? 0] ?? 'closed' } : {};
  return { a: [ax, ay], b: [bx, by], ...door, ...rules };
}
