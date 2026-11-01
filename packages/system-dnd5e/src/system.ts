import type { SystemDefinition } from '@vtt/core';
import type { Perceiver } from '@vtt/shared';
import { editionOf, srdFor, toEdition } from './content.ts';
import { perceiverOf } from './perception.ts';
import { type Actor, ActorSchema, type Token, TokenSchema } from './token-schema.ts';

// D&D 5e as the engine sees it: its editions, the shape of its creatures,
// how they perceive, and what check-game reports about them. The rules
// themselves (creature.ts, attack.ts, spells.ts...) are used directly by the
// server's action handlers and the client's sheets.

/** What a creature sheet refers to by id: a monster, items and spells. */
type Sheet = Pick<Token, 'monster' | 'inventory' | 'stats'>;

/** References from a sheet to SRD content the edition doesn't have. */
function contentIssues(sheet: Sheet, rules: string): string[] {
  const edition = editionOf(sheet, { rules });
  const srd = srdFor(edition);
  const monster = sheet.monster && !srd.monsters.has(sheet.monster) ? [sheet.monster] : [];
  return [
    ...monster.map((m) => `unknown monster "${m}" in the ${edition} rules`),
    ...(sheet.inventory ?? []).filter((e) => !srd.items.has(e.item)).map((e) => `unknown item "${e.item}"`),
    ...(sheet.stats?.spells ?? [])
      .filter((s) => !srd.spells.has(s))
      .map((s) => `unknown spell "${s}" in the ${edition} rules`),
  ];
}

export interface Dnd5eSystem extends SystemDefinition<Token, Actor> {
  /** A token's senses and conditions, for vision and fog. */
  perceiver: (token: Token, rules: string | undefined) => Perceiver;
}

export const dnd5e: Dnd5eSystem = {
  id: 'dnd5e',
  name: 'Dungeons & Dragons 5e',
  editions: [
    { id: '2014', name: '2014 rules (SRD 5.1)' },
    { id: '2024', name: '2024 rules (SRD 5.2)' },
  ],
  tokenSchema: TokenSchema,
  actorSchema: ActorSchema,
  tokenIssues: contentIssues,
  perceiver: (token, rules) => {
    const monster = token.monster
      ? srdFor(editionOf(token, { rules: toEdition(rules) })).monsters.get(token.monster)
      : undefined;
    return perceiverOf(token, monster);
  },
};
