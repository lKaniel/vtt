import { canObserve, type Owned, type Player } from '@vtt/shared';
import { type Character, characterClasses, type Class, ClassSchema } from '@vtt/system-dnd5e';
import type { GameStore } from '../store/game-store.ts';
import { HttpError } from '../http/http-json.ts';

// The GM's homebrew classes for the character creator: those of the game
// that the player may read. A character keeps a copy of each one it takes,
// refreshed from the game whenever it is saved.

function readable(docs: readonly Record<string, unknown>[], seat: Player): Class[] {
  return docs
    .filter((d) => d.kind === 'class' && canObserve(d as Owned, seat))
    .flatMap((d) => {
      const parsed = ClassSchema.safeParse(d);
      return parsed.success ? [parsed.data] : [];
    });
}

/** The homebrew classes `seat` may build a character with at the game, by id. */
export function homebrewFor(store: GameStore, seat: Player): Map<string, Class> {
  return new Map(readable(store.docs.all('homebrew'), seat).map((cls) => [cls.id, cls]));
}

/** `c` with the current copy of each homebrew class it takes, and none it doesn't; refuses one it may not use. */
export function withCurrentHomebrew(c: Character, available: ReadonlyMap<string, Class>): Character {
  const used = new Set(characterClasses(c).map((k) => k.class));
  const homebrew = c.homebrew
    .filter((cls) => used.has(cls.id))
    .map((cls) => {
      const current = available.get(cls.id);
      if (!current) throw new HttpError(400, `The homebrew class "${cls.name}" isn't shared with you in this game.`);
      return current;
    });
  return { ...c, homebrew };
}
