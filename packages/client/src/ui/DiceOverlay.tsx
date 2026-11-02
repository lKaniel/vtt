import { useEffect } from 'react';
import { currentMotion } from '../animations.ts';
import { currentDice, diceForMessage } from '../dice-throw.ts';
import type { Session } from '../session.ts';

// Throws 3D dice (dice-3d.ts, loaded on the first roll) for each new chat
// card with rolls on it, unless this player turned them off.

export function DiceOverlay({ session }: Readonly<{ session: Session }>) {
  useEffect(() => {
    const thrown = new Set<string>();
    return session.on('chat', (message) => {
      const dice = diceForMessage(message, { dice: currentDice(), motion: currentMotion() }, thrown);
      if (!dice.length) return;
      import('../dice-3d.ts').then((m) => m.throwDice(dice, message.color)).catch(() => undefined);
    });
  }, [session]);
  return null;
}
