import type { Creature } from './creature.ts';
import type { Token } from './token-schema.ts';

// Falling: a creature in the air falls when it can't fly. A flyer knocked
// prone, held still or with its speed at 0 falls too, unless it hovers.
// The fall itself is 1d6 bludgeoning per 10 feet (at most 20d6) and it
// lands prone (the server's falls.ts).

/** Whether a creature above the ground stays up: it hovers, flies and can move, or a spell holds it there. */
export function keepsAloft(
  token: Pick<Token, 'aloft'>,
  sheet: Pick<Creature, 'speeds' | 'speed' | 'conditions'>,
): boolean {
  if (token.aloft || sheet.speeds?.hover) return true;
  return (sheet.speeds?.fly ?? 0) > 0 && sheet.speed > 0 && !sheet.conditions.includes('prone');
}
