import { type Actor, characterOf, isCharacter } from '@vtt/system-dnd5e';
import { canControl, type Player } from '@vtt/shared';

// What the GM may give a seat to play (Players tab): every actor, the
// player characters first, each ticked when the seat owns it.

export interface PlaysChoice {
  id: string;
  name: string;
  /** The seat owns it: the player acts with it. */
  plays: boolean;
  /** The seat's own character (game.json `character`). */
  main: boolean;
}

export interface PlaysChoices {
  characters: PlaysChoice[];
  others: PlaysChoice[];
  /** What the seat plays, its character first. */
  names: string[];
}

export function playsChoices(player: Player, actors: Iterable<Actor>): PlaysChoices {
  const all = [...actors].sort((a, b) => a.name.localeCompare(b.name));
  const main = characterOf(player, all)?.id;
  const choice = (a: Actor): PlaysChoice => ({
    id: a.id,
    name: a.name,
    plays: canControl(a, player),
    main: a.id === main,
  });
  const choices = all.map(choice);
  const characters = choices.filter((_, i) => isCharacter(all[i]!));
  const others = choices.filter((_, i) => !isCharacter(all[i]!));
  const played = choices.filter((c) => c.plays).sort((a, b) => Number(b.main) - Number(a.main));
  return { characters, others, names: played.map((c) => c.name) };
}
