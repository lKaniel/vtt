import { z } from 'zod';
import classAutomation from '../content/srd/class-automation.json' with { type: 'json' };
import classes51 from '../content/srd/classes-5.1.json' with { type: 'json' };
import classes52 from '../content/srd/classes-5.2.json' with { type: 'json' };
import items from '../content/srd/items.json' with { type: 'json' };
import monsters51 from '../content/srd/monsters-5.1.json' with { type: 'json' };
import monsters52 from '../content/srd/monsters-5.2.json' with { type: 'json' };
import spellAutomation from '../content/srd/spell-automation.json' with { type: 'json' };
import spells51 from '../content/srd/spells-5.1.json' with { type: 'json' };
import spells52 from '../content/srd/spells-5.2.json' with { type: 'json' };
import tokenArt from '../content/token-art.json' with { type: 'json' };
import type { Token, World } from './schema.ts';
import { ClassSchema, SpellSchema, type Class, type Spell } from './spell-schema.ts';
import { ItemSchema, MonsterSchema, type Edition, type Item, type Monster } from './stats-schema.ts';

/** Everything a token can refer to by id, for one rules edition. */
export interface Content {
  edition: Edition;
  items: ReadonlyMap<string, Item>;
  monsters: ReadonlyMap<string, Monster>;
  spells: ReadonlyMap<string, Spell>;
  classes: ReadonlyMap<string, Class>;
}

function byId<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((x) => [x.id, x]));
}

type Entry = Record<string, unknown> & { id: string };
/** Hand-written fields per id: for both editions and/or for one. */
type Overlay = Record<string, Partial<Record<'both' | Edition, Record<string, unknown>>> | string>;

/** The overlay's fields for one entry and edition; `features` are merged by feature id. */
function withOverlay(entry: Entry, overlay: Overlay, edition: Edition): Entry {
  const extra = overlay[entry.id];
  if (!extra || typeof extra === 'string') return entry;
  let out = entry;
  for (const part of [extra.both, extra[edition]]) if (part) out = merge(out, part);
  return out;
}

function merge(entry: Entry, part: Record<string, unknown>): Entry {
  const { features, ...rest } = part as { features?: Record<string, object> };
  // null in the overlay takes a generated field away (false life's healing).
  const kept = Object.entries({ ...entry, ...rest } as Record<string, unknown>).filter(([, value]) => value !== null);
  const out: Entry = Object.fromEntries(kept) as Entry;
  if (features && Array.isArray(entry.features)) {
    out.features = (entry.features as Entry[]).map((f) => ({ ...f, ...features[f.id] }));
  }
  return out;
}

function load<T extends { id: string }>(
  schema: z.ZodType<T>,
  list: unknown[],
  [overlay, edition]: [Overlay, Edition],
): Map<string, T> {
  const entries = (list as Entry[]).map((e) => withOverlay(e, overlay, edition));
  return byId(z.array(schema).parse(entries));
}

/**
 * Gives each monster listed in `art` its painted token, `/art/tokens/<file>.webp`.
 * Several monsters can share one painting (a 2014 goblin and a 2024 goblin warrior).
 */
export function withTokenArt(monsters: Monster[], art: Record<string, string>): Monster[] {
  return monsters.map((m) => (art[m.id] ? { ...m, img: `/art/tokens/${art[m.id]}.webp` } : m));
}

const sharedItems = byId(z.array(ItemSchema).parse(items));
const monsterList = z.array(MonsterSchema);

function edition(edition: Edition, data: { monsters: unknown[]; spells: unknown[]; classes: unknown[] }): Content {
  return {
    edition,
    items: sharedItems,
    monsters: byId(withTokenArt(monsterList.parse(data.monsters), tokenArt as Record<string, string>)),
    spells: load(SpellSchema, data.spells, [spellAutomation as Overlay, edition]),
    classes: load(ClassSchema, data.classes, [classAutomation as Overlay, edition]),
  };
}

/** The bundled SRD content (CC-BY-4.0), validated on load: 5.1 for 2014, 5.2 for 2024. */
const SRD: Record<Edition, Content> = {
  '2014': edition('2014', { monsters: monsters51, spells: spells51, classes: classes51 }),
  '2024': edition('2024', { monsters: monsters52, spells: spells52, classes: classes52 }),
};

export function srdFor(edition: Edition): Content {
  return SRD[edition];
}

/** The edition a token plays by: its own `stats.rules`, else the world's. */
export function editionOf(token: Pick<Token, 'stats'>, world: Pick<World, 'rules'>): Edition {
  return token.stats?.rules ?? world.rules;
}
