import { canObserve, type Owned, type Player } from '@vtt/shared';
import { type Character, characterClasses, type Class, ClassSchema } from '@vtt/system-dnd5e';
import type { Account } from './accounts.ts';
import type { GameHub } from './game-hub.ts';
import { HttpError } from './http-json.ts';

// The GMs' homebrew classes for the account character creator: those of the
// games an account sits in that its seat may read. A character keeps a copy
// of each one it takes, refreshed from the game whenever it is saved.

function readable(docs: readonly Record<string, unknown>[], seat: Player): Class[] {
  return docs
    .filter((d) => d.kind === 'class' && canObserve(d as Owned, seat))
    .flatMap((d) => {
      const parsed = ClassSchema.safeParse(d);
      return parsed.success ? [parsed.data] : [];
    });
}

/** The homebrew classes `account` may build a character with, by id (the first game's copy of an id wins). */
export async function homebrewFor(hub: GameHub, account: Account): Promise<Map<string, Class>> {
  const out = new Map<string, Class>();
  for (const id of hub.ids()) {
    const seat = (await hub.info(id)).players.find((p) => p.id === account.id);
    if (!seat) continue;
    const { store } = await hub.open(id);
    for (const cls of readable(store.docs.all('homebrew'), seat)) if (!out.has(cls.id)) out.set(cls.id, cls);
  }
  return out;
}

/** `c` with the current copy of each homebrew class it takes, and none it doesn't; refuses one it may not use. */
export function withCurrentHomebrew(c: Character, available: ReadonlyMap<string, Class>): Character {
  const used = new Set(characterClasses(c).map((k) => k.class));
  const homebrew = c.homebrew
    .filter((cls) => used.has(cls.id))
    .map((cls) => {
      const current = available.get(cls.id);
      if (!current)
        throw new HttpError(400, `The homebrew class "${cls.name}" isn't shared with you in any of your games.`);
      return current;
    });
  return { ...c, homebrew };
}
