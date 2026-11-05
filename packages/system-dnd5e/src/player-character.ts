import { canControl, isGm, ownersOf, type Player } from '@vtt/shared';
import type { Actor } from './token-schema.ts';

// Each player's own character, as Foundry's User.character: the actor their
// seat names (game.json `character`), else the one they plainly own. Their
// token is the one the table picks for them, the Actors tab puts first and
// the in-game level up works on.

/** An actor that is a player character rather than a creature: a sheet of its own, no stat block. */
export function isCharacter(actor: Pick<Actor, 'monster' | 'stats'>): boolean {
  return !actor.monster && !!actor.stats;
}

/** The player's character: their seat's, else the character only they own, else one they share. */
export function characterOf<A extends Actor>(player: Player, actors: Iterable<A>): A | undefined {
  if (isGm(player)) return undefined;
  const list = [...actors];
  const named = player.character && list.find((a) => a.id === player.character);
  if (named) return named;
  const theirs = list.filter((a) => isCharacter(a) && a.linked !== false && canControl(a, player));
  const alone = theirs.filter((a) => ownersOf(a).length === 1 && a.ownership?.default !== 'owner');
  const byName = (a: A, b: A) => a.name.localeCompare(b.name);
  return alone.toSorted(byName)[0] ?? theirs.toSorted(byName)[0];
}
