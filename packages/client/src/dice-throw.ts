import type { ChatEntry, Roll } from '@vtt/shared';
import type { Motion } from './animations.ts';
import { readPref, writePref } from './prefs.ts';

// Which dice a chat card throws on screen (dice-3d.ts draws them, like the
// Dice So Nice module): every roll on the card, one die per number rolled,
// for the dice that have a shape.

/** One die to throw: its shape, the labels on its faces, and the face that ends up on top. */
export interface ThrownDie {
  sides: 4 | 6 | 8 | 10 | 12 | 20;
  labels: string[];
  face: number;
}

const SHAPES = new Set([4, 6, 8, 10, 12, 20]);
const MAX_DICE = 12;

const isRoll = (v: unknown): v is Roll =>
  typeof v === 'object' && v !== null && Array.isArray((v as Roll).terms) && typeof (v as Roll).total === 'number';

/** Every roll on a chat card: its own, and those of the attack, spell or check it reports. */
export function rollsIn(message: ChatEntry | object): Roll[] {
  const out: Roll[] = [];
  const walk = (v: unknown): void => {
    if (isRoll(v)) out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object' && v !== null) Object.values(v).forEach(walk);
  };
  walk(message);
  return out;
}

const numbers = (n: number, label = (i: number) => String(i + 1)) => Array.from({ length: n }, (_, i) => label(i));

/** The dice for one rolled number of a term with `sides` sides (a d100 is two d10s). */
function diceFor(sides: number, value: number): ThrownDie[] {
  if (sides === 100) {
    const tens = Math.floor((value - 1) / 10);
    return [
      { sides: 10, labels: numbers(10, (i) => String(i * 10).padStart(2, '0')), face: tens },
      { sides: 10, labels: numbers(10), face: (value - 1) % 10 },
    ];
  }
  if (!SHAPES.has(sides)) return [];
  return [{ sides: sides as ThrownDie['sides'], labels: numbers(sides), face: value - 1 }];
}

/** The dice the rolls throw, a dozen at most. */
export function diceToThrow(rolls: readonly Roll[]): ThrownDie[] {
  const dice = rolls.flatMap((r) =>
    r.terms.flatMap((t) => {
      const sides = Number(/d(\d+)/i.exec(t.text)?.[1]);
      return sides ? t.rolls.flatMap((v) => diceFor(sides, v)) : [];
    }),
  );
  return dice.slice(0, MAX_DICE);
}

/** Whether this browser's player wants 3D dice (their own option). */
export type DiceChoice = 'on' | 'off';

export const currentDice = (): DiceChoice => readPref('dice3d', ['on', 'off'] as const, 'on');
export const setDice = (choice: DiceChoice): void => writePref('dice3d', choice);

/** The dice a new chat card throws: none if the player turned them or animations off, it was hidden, or it was thrown already. */
export function diceForMessage(
  message: ChatEntry,
  wants: { dice: DiceChoice; motion: Motion },
  thrown: Set<string>,
): ThrownDie[] {
  if (wants.dice === 'off' || wants.motion === 'off' || message.hidden || thrown.has(message.id)) return [];
  thrown.add(message.id);
  return diceToThrow(rollsIn(message));
}
