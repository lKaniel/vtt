import { canObserve, type Owned, type Player } from '@vtt/shared';
import {
  type Character,
  characterClasses,
  type Class,
  ClassSchema,
  contentWith,
  srdFor,
  toEdition,
} from '@vtt/system-dnd5e';
import { contentCompendia } from './game-packs.ts';
import type { GameStore } from '../store/game-store.ts';
import { HttpError } from '../http/http-json.ts';

// The classes beyond the SRD for the character creator: those of the packs
// the game uses, and the GM's homebrew that the player may read. A character keeps a copy of each one it takes,
// refreshed from the game whenever it is saved.

function readable(docs: readonly Record<string, unknown>[], seat: Player): Class[] {
  return docs
    .filter((d) => d.kind === 'class' && canObserve(d as Owned, seat))
    .flatMap((d) => {
      const parsed = ClassSchema.safeParse(d);
      return parsed.success ? [parsed.data] : [];
    });
}

/** The classes of the packs the game uses (a pack's homebrew), with their automation. */
function packClasses(store: GameStore): Class[] {
  const edition = toEdition(store.world.rules);
  const content = contentWith(edition, contentCompendia(store.packs, store.campaign, store.system));
  const srd = srdFor(edition).classes;
  return [...content.classes.values()].filter((cls) => !srd.has(cls.id));
}

/** The classes `seat` may build a character with at the game beyond the SRD: its packs', then its homebrew, by id. */
export function homebrewFor(store: GameStore, seat: Player): Map<string, Class> {
  const classes = [...packClasses(store), ...readable(store.docs.all('homebrew'), seat)];
  return new Map(classes.map((cls) => [cls.id, cls]));
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
