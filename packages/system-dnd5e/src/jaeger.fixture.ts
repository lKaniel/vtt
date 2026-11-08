import type { PackCompendium } from '@vtt/core';
import { contentWith } from './packs.ts';
import { resolveCreature } from './creature.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Content } from './content.ts';

// A jaeger as a private pack brings it: the class's name and subclasses, no
// rules text. Its automation comes from class-automation.json by id.

const compendium: PackCompendium = {
  id: 'classes',
  name: 'Classes',
  type: 'class',
  path: 'classes.json',
  pack: 'test-hunt',
  docs: [
    {
      id: 'jaeger',
      name: 'Jaeger',
      subclasses: ['absolute', 'heretic', 'marauder', 'salvation', 'sanguine'].map((c) => ({
        id: `${c}-chapter`,
        name: `${c} Chapter`,
      })),
    },
  ],
};

export const huntPacks = [compendium];
export const huntContent: Content = contentWith('2014', huntPacks);

interface JaegerData extends Partial<Token> {
  features?: string[];
  /** Its Chapter, e.g. "marauder" for the Marauder Chapter. */
  chapter?: string;
  abilities?: Record<string, number>;
}

/** A jaeger of `level` with Dex 16 (+3) and Str 12 (+1); `data` sets more token fields. */
export function jaeger(level: number, data: JaegerData = {}): Token {
  const { features, chapter, abilities, ...rest } = data;
  return TokenSchema.parse({
    id: 'hunter',
    name: 'Hunter',
    x: 50,
    y: 50,
    stats: {
      ...(chapter
        ? { classes: [{ class: 'jaeger', level, subclass: `${chapter}-chapter` }] }
        : { class: 'jaeger', level }),
      maxHp: 40,
      abilities: { str: 12, dex: 16, con: 14, int: 12, ...abilities },
      ...(features && { features }),
    },
    ...rest,
  });
}

export const huntSheet = (t: Token) => resolveCreature(t, huntContent)!;
