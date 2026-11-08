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
      subclasses: [{ id: 'absolute-chapter', name: 'Absolute Chapter' }],
    },
  ],
};

export const huntPacks = [compendium];
export const huntContent: Content = contentWith('2014', huntPacks);

/** A jaeger of `level` with Dex 16 (+3) and Str 12 (+1); `data` sets more token fields. */
export function jaeger(level: number, data: Partial<Token> & { features?: string[] } = {}): Token {
  const { features, ...rest } = data;
  return TokenSchema.parse({
    id: 'hunter',
    name: 'Hunter',
    x: 50,
    y: 50,
    stats: {
      class: 'jaeger',
      level,
      maxHp: 40,
      abilities: { str: 12, dex: 16, con: 14, int: 12 },
      ...(features && { features }),
    },
    ...rest,
  });
}

export const huntSheet = (t: Token) => resolveCreature(t, huntContent)!;
