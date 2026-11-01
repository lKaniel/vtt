import { z } from 'zod';
import { addScores, hitPointsAtLevel1, STANDARD_ARRAY } from './character-rules.ts';
import { srdFor, type Content } from './content.ts';
import { abilityMod } from './creature-math.ts';
import { originsFor, type Background, type ClassOptions, type KitStep, type Origins, type Species } from './origins.ts';
import type { Token } from './schema.ts';
import type { Class } from './spell-schema.ts';
import {
  ABILITIES,
  EditionSchema,
  type Abilities,
  type Ability,
  type Edition,
  type InventoryEntry,
} from './stats-schema.ts';

// A player's character as built in the character creator. It lives with the
// player's account, not in a world: joining a game puts it on the map as a
// token (characterToken), and levelling up updates that token.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');
const score = z.number().int().min(1).max(30);
const Bonuses = z.partialRecord(z.enum(ABILITIES), z.number().int().min(-2).max(4));

export const CharacterSchema = z.object({
  id,
  /** The account that owns it. */
  owner: id,
  name: z.string().trim().min(1).max(40),
  rules: EditionSchema.default('2014'),
  species: id,
  /** Subrace (2014) or lineage (2024). */
  subspecies: id.optional(),
  /** For species that may be small or medium. */
  size: z.enum(['small', 'medium']).optional(),
  class: id,
  subclass: id.optional(),
  background: id,
  level: z.number().int().min(1).max(20).default(1),
  /** Scores before any bonus, from point buy, the standard array, rolls or typed in. */
  base: z.object({ str: score, dex: score, con: score, int: score, wis: score, cha: score }),
  method: z.enum(['point-buy', 'standard', 'roll', 'manual']).default('point-buy'),
  /** Ability bonuses the player chose: a half-elf's +1s (2014) or the background's +2/+1 (2024). */
  bonusPicks: Bonuses.default({}),
  /** Skills picked from the class list; background skills come on top. */
  skills: z.array(id).default([]),
  /** Hit points gained at each level after the first (rolled or average), before Constitution. */
  hpRolls: z.array(z.number().int().min(1)).default([]),
  /** One per ability score improvement taken: two +1s or one +2. */
  improvements: z.array(Bonuses).default([]),
  /** Cantrips and spells known, prepared or (2014 wizard) in the spellbook. */
  spells: z.array(id).default([]),
  /** Starting kit choices: step id to option id. */
  kit: z.record(z.string(), z.string()).default({}),
  color: z.string().default('#c0603a'),
  img: z.string().optional(),
});
export type Character = z.infer<typeof CharacterSchema>;

/** The content a character is built from, for its edition. */
export interface Book {
  content: Content;
  origins: Origins;
}

export function bookFor(edition: Edition): Book {
  return { content: srdFor(edition), origins: originsFor(edition) };
}

export interface Parts {
  book: Book;
  species?: Species;
  subspecies?: Species['subspecies'][number];
  background?: Background;
  cls?: Class;
  options?: ClassOptions;
}

/** Looks up everything a character names; missing parts are undefined. */
export function partsOf(c: Character): Parts {
  const book = bookFor(c.rules);
  const species = book.origins.species.find((s) => s.id === c.species);
  return {
    book,
    species,
    subspecies: species?.subspecies.find((s) => s.id === c.subspecies),
    background: book.origins.backgrounds.find((b) => b.id === c.background),
    cls: book.content.classes.get(c.class),
    options: book.origins.classes.find((o) => o.id === c.class),
  };
}

export function abilityScores(c: Character, parts = partsOf(c)): Abilities {
  const fixed = [parts.species?.bonuses ?? {}, parts.subspecies?.bonuses ?? {}];
  return addScores(c.base, ...fixed, c.bonusPicks, ...c.improvements);
}

/** Dwarven Toughness: one extra hit point per level. */
function hasToughness(parts: Parts): boolean {
  const traits = [...(parts.species?.traits ?? []), ...(parts.subspecies?.traits ?? [])];
  return traits.some((t) => t.name === 'Dwarven Toughness');
}

export function characterMaxHp(c: Character, parts = partsOf(c)): number {
  const con = abilityMod(abilityScores(c, parts).con);
  const die = parts.cls?.hitDie ?? 8;
  const later = c.hpRolls.reduce((sum, roll) => sum + Math.max(1, roll + con), 0);
  return hitPointsAtLevel1(die, con) + later + (hasToughness(parts) ? c.level : 0);
}

export function characterSkills(c: Character, parts = partsOf(c)): string[] {
  return [...new Set([...(parts.background?.skills ?? []), ...c.skills])];
}

/** The steps whose condition holds, each with the option picked (the first by default). */
export function activeKit(steps: readonly KitStep[], picks: Readonly<Record<string, string>>) {
  const chosen = new Map<string, string>();
  const out: { step: KitStep; option: KitStep['options'][number] }[] = [];
  for (const step of steps) {
    if (step.when && chosen.get(step.when.step) !== step.when.option) continue;
    const option = step.options.find((o) => o.id === picks[step.id]) ?? step.options[0];
    if (!option) continue;
    chosen.set(step.id, option.id);
    out.push({ step, option });
  }
  return out;
}

export function kitItems(steps: readonly KitStep[], picks: Readonly<Record<string, string>>): InventoryEntry[] {
  const out: InventoryEntry[] = [];
  for (const { option } of activeKit(steps, picks)) {
    for (const i of option.items) {
      const same = out.find((o) => o.item === i.item);
      if (same) same.qty += i.qty;
      else out.push({ item: i.item, qty: i.qty, equipped: i.equipped });
    }
  }
  return out;
}

export function characterInventory(c: Character, parts = partsOf(c)): InventoryEntry[] {
  return kitItems([...(parts.options?.kit ?? []), ...(parts.background?.kit ?? [])], c.kit);
}

/** Token fields for a character; the caller adds id and position. */
export function characterToken(c: Character, parts = partsOf(c)): Omit<Token, 'id' | 'x' | 'y'> {
  const darkvision = Math.max(parts.species?.darkvision ?? 0, parts.subspecies?.darkvision ?? 0);
  return {
    name: c.name,
    size: 1,
    color: c.color,
    ...(c.img ? { img: c.img } : {}),
    speed: parts.species?.speed ?? 30,
    ownership: { default: 'limited', [c.owner]: 'owner' },
    darkvision,
    hidden: false,
    stats: {
      rules: c.rules,
      class: c.class,
      level: c.level,
      abilities: abilityScores(c, parts),
      maxHp: characterMaxHp(c, parts),
      skills: characterSkills(c, parts),
      spells: c.spells,
    },
    inventory: characterInventory(c, parts),
  };
}

/** A fresh level 1 character with the standard array, for the creator to start from. */
export function newCharacter({ id, owner, rules }: { id: string; owner: string; rules: Edition }): Character {
  const base = Object.fromEntries(ABILITIES.map((a, i) => [a, STANDARD_ARRAY[i]])) as Record<Ability, number>;
  return CharacterSchema.parse({
    id,
    owner,
    name: 'New hero',
    rules,
    species: 'human',
    size: rules === '2024' ? 'medium' : undefined,
    class: 'fighter',
    background: originsFor(rules).backgrounds[0]?.id ?? 'acolyte',
    base,
    method: 'standard',
  });
}
