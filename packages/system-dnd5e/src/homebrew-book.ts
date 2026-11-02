import { homebrewCompendia } from './homebrew.ts';
import { type ClassOptions, type Origins, SKILLS } from './origins.ts';
import { contentWith } from './packs.ts';
import type { Class } from './spell-schema.ts';
import type { Content } from './content.ts';
import type { Edition } from './stats-schema.ts';

// The character creator's book with a character's homebrew classes in it:
// the classes join the content, and each gets the creator's options (two
// skills of any, its subclasses, no starting kit).

const ANY_SKILL = Object.keys(SKILLS);

/** What the creator offers for a homebrew class. */
function homebrewOptions(cls: Class): ClassOptions {
  return {
    id: cls.id,
    skills: { pick: 2, from: ANY_SKILL },
    subclassLevel: cls.subclassLevel ?? 3,
    subclasses: (cls.subclasses ?? []).map(({ id, name, description }) => ({ id, name, description })),
    kit: [],
  };
}

const cache = new WeakMap<readonly Class[], Partial<Record<Edition, { content: Content; origins: Origins }>>>();

/** The edition's book plus `classes`, the same objects while `classes` is the same list. */
export function withHomebrewClasses(
  edition: Edition,
  origins: Origins,
  classes: readonly Class[],
): { content: Content; origins: Origins } {
  const known = cache.get(classes) ?? {};
  cache.set(classes, known);
  const hit = known[edition];
  if (hit) return hit;
  const docs = classes.map((cls) => ({ ...cls, kind: 'class' }));
  const book = {
    content: contentWith(edition, homebrewCompendia(docs)),
    origins: { ...origins, classes: [...origins.classes, ...classes.map(homebrewOptions)] },
  };
  known[edition] = book;
  return book;
}
