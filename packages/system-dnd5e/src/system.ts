import type { PackCompendium, SystemDefinition } from '@vtt/core';
import type { Perceiver } from '@vtt/shared';
import { editionOf, toEdition } from './content.ts';
import { CONTENT_TYPES, contentWith, packContentIssues, SRD_PACKS } from './packs.ts';
import { inventoryIssues } from './carrying.ts';
import { withOwn } from './own-content.ts';
import { perceiverOf } from './perception.ts';
import { type Actor, ActorSchema, type Token, TokenSchema } from './token-schema.ts';

// D&D 5e as the engine sees it: its editions, the shape of its creatures,
// how they perceive, and what check-game reports about them. The rules
// themselves (creature.ts, attack.ts, spells.ts...) are used directly by the
// server's action handlers and the client's sheets.

/** What a creature sheet refers to by id: a monster, items and spells. */
type Sheet = Pick<Token, 'monster' | 'inventory' | 'stats' | 'own'>;

/** References from a sheet to content the edition (and the game's packs) doesn't have. */
function contentIssues(sheet: Sheet, rules: string, packs?: readonly PackCompendium[]): string[] {
  const edition = editionOf(sheet, { rules });
  const srd = withOwn(contentWith(edition, packs), sheet);
  const monster = sheet.monster && !srd.monsters.has(sheet.monster) ? [sheet.monster] : [];
  return [
    ...monster.map((m) => `unknown monster "${m}" in the ${edition} rules`),
    ...(sheet.inventory ?? []).filter((e) => !srd.items.has(e.item)).map((e) => `unknown item "${e.item}"`),
    ...(sheet.stats?.spells ?? [])
      .filter((s) => !srd.spells.has(s))
      .map((s) => `unknown spell "${s}" in the ${edition} rules`),
    ...inventoryIssues(sheet, srd),
  ];
}

export interface Dnd5eSystem extends SystemDefinition<Token, Actor> {
  /** A token's senses and conditions, for vision and fog. */
  perceiver: (token: Token, rules: string | undefined, packs?: readonly PackCompendium[]) => Perceiver;
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
  packs: SRD_PACKS,
  contentTypes: CONTENT_TYPES,
  packContentIssues,
  perceiver: (token, rules, packs) => {
    const monster = token.monster
      ? contentWith(editionOf(token, { rules: toEdition(rules) }), packs).monsters.get(token.monster)
      : undefined;
    return perceiverOf(token, monster);
  },
};
