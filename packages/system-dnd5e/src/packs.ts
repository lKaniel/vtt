import { type PackCompendium, PackManifestSchema, type SystemPackSource } from '@vtt/core';
import type { z } from 'zod';
import { type Content, srdFor, withClassAutomation } from './content.ts';
import { ClassSchema, SpellSchema } from './spell-schema.ts';
import { MonsterSchema } from './monster-schema.ts';
import type { Edition } from './stats-schema.ts';
import { ItemSchema } from './item-schema.ts';

// D&D content in asset packs. The bundled SRD is two packs the system ships
// (always on), and an installed pack's monster, item and spell compendia add
// to what a game's tokens can refer to: contentWith(edition, compendia) is
// the SRD plus those. Packs of scenes and actors are copied into a game
// instead (see docs/packs.md).

type SystemPack = SystemPackSource;

/** Compendium types that are rules content, and the schema of their documents. */
const CONTENT_SCHEMAS = { monster: MonsterSchema, item: ItemSchema, spell: SpellSchema, class: ClassSchema } as const;
type ContentType = keyof typeof CONTENT_SCHEMAS;
export const CONTENT_TYPES = Object.keys(CONTENT_SCHEMAS) as ContentType[];

const isContentType = (type: string): type is ContentType => type in CONTENT_SCHEMAS;

function srdPack(edition: Edition): SystemPack {
  const srd = srdFor(edition);
  const lists: Record<string, unknown[]> = {
    monsters: [...srd.monsters.values()],
    items: [...srd.items.values()],
    spells: [...srd.spells.values()],
  };
  const version = edition === '2014' ? '5.1' : '5.2';
  const compendium = (id: string, name: string, type: ContentType) => ({
    id,
    name,
    type,
    path: `${id}.json`,
    rules: edition,
  });
  const manifest = PackManifestSchema.parse({
    id: `dnd5e-srd-${edition}`,
    name: `D&D SRD ${version} (${edition} rules)`,
    version,
    system: 'dnd5e',
    license: 'CC-BY-4.0',
    description: `The System Reference Document ${version}: monsters, equipment and spells.`,
    compendia: [
      compendium('monsters', 'Monsters', 'monster'),
      compendium('items', 'Equipment', 'item'),
      compendium('spells', 'Spells', 'spell'),
    ],
  });
  return { manifest, compendium: (id) => lists[id] ?? [] };
}

/** The SRD 5.1 and 5.2 as packs, always on in every D&D game. */
export const SRD_PACKS: readonly SystemPack[] = [srdPack('2014'), srdPack('2024')];

const forEdition = (c: PackCompendium, edition: Edition) =>
  isContentType(c.type) && (c.rules === undefined || c.rules === edition);

/** The documents of a compendium its schema accepts, parsed. */
function parsedDocs(c: PackCompendium, edition: Edition): { id: string }[] {
  const schema: z.ZodType<{ id: string }> = CONTENT_SCHEMAS[c.type as ContentType];
  return c.docs.flatMap((doc) => {
    const parsed = schema.safeParse(c.type === 'class' ? withClassAutomation(doc, edition) : doc);
    return parsed.success ? [parsed.data] : [];
  });
}

const cache = new WeakMap<readonly PackCompendium[], Partial<Record<Edition, Content>>>();

/** The SRD of `edition` plus the monsters, items, spells and classes of a game's pack compendia. */
export function contentWith(edition: Edition, compendia: readonly PackCompendium[] = []): Content {
  const srd = srdFor(edition);
  const mine = compendia.filter((c) => forEdition(c, edition));
  if (!mine.length) return srd;
  const known = cache.get(compendia) ?? {};
  if (known[edition]) return known[edition];
  const add = (type: ContentType, base: ReadonlyMap<string, unknown>) =>
    new Map([
      ...base,
      ...mine.filter((c) => c.type === type).flatMap((c) => parsedDocs(c, edition).map((d) => [d.id, d] as const)),
    ]);
  const content = {
    ...srd,
    monsters: add('monster', srd.monsters),
    items: add('item', srd.items),
    spells: add('spell', srd.spells),
    classes: add('class', srd.classes),
  } as Content;
  cache.set(compendia, { ...known, [edition]: content });
  return content;
}

/** What is wrong with the documents of a monster, item, spell or class compendium, one line each. */
export function packContentIssues(c: PackCompendium): string[] {
  if (!isContentType(c.type)) return [];
  const schema = CONTENT_SCHEMAS[c.type] as z.ZodType;
  return c.docs.flatMap((doc, i) => {
    const parsed = schema.safeParse(
      c.type === 'class' ? withClassAutomation(doc, (c.rules as Edition | undefined) ?? '2014') : doc,
    );
    if (parsed.success) return [];
    const id = (doc as { id?: unknown } | null)?.id;
    const issue = parsed.error.issues[0]!;
    const which = typeof id === 'string' ? `${c.id} #${i + 1} (${id})` : `${c.id} #${i + 1}`;
    return [`${which}: ${issue.path.join('.')} ${issue.message}`];
  });
}
