import type { GameSettings } from './game-settings.ts';
import { z } from 'zod';
import classAutomation from '../content/srd/class-automation.json' with { type: 'json' };
import classes51 from '../content/srd/classes-5.1.json' with { type: 'json' };
import classes52 from '../content/srd/classes-5.2.json' with { type: 'json' };
import itemAutomation from '../content/srd/item-automation.json' with { type: 'json' };
import handItems from '../content/srd/items.json' with { type: 'json' };
import items51 from '../content/srd/items-5.1.json' with { type: 'json' };
import items52 from '../content/srd/items-5.2.json' with { type: 'json' };
import monsters51 from '../content/srd/monsters-5.1.json' with { type: 'json' };
import origins51 from '../content/srd/origins-5.1.json' with { type: 'json' };
import origins52 from '../content/srd/origins-5.2.json' with { type: 'json' };
import monsters52 from '../content/srd/monsters-5.2.json' with { type: 'json' };
import spellAutomation from '../content/srd/spell-automation.json' with { type: 'json' };
import spells51 from '../content/srd/spells-5.1.json' with { type: 'json' };
import spells52 from '../content/srd/spells-5.2.json' with { type: 'json' };
import tokenArt from '../content/token-art.json' with { type: 'json' };
import type { World } from '@vtt/shared';
import type { Token } from './token-schema.ts';
import { type Class, ClassSchema, type Spell, SpellSchema } from './spell-schema.ts';
import { type Monster, MonsterSchema } from './monster-schema.ts';
import { type Edition, EditionSchema } from './stats-schema.ts';
import { type Item, ItemSchema } from './item-schema.ts';

/** Everything a token can refer to by id, for one rules edition. */
export interface Content {
  edition: Edition;
  items: ReadonlyMap<string, Item>;
  monsters: ReadonlyMap<string, Monster>;
  spells: ReadonlyMap<string, Spell>;
  classes: ReadonlyMap<string, Class>;
  /** The game's settings (game-settings.ts); missing: the defaults. */
  settings?: GameSettings;
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
  const { features, subclasses, ...rest } = part as {
    features?: Record<string, object>;
    subclasses?: Record<string, Record<string, unknown>>;
  };
  // null in the overlay takes a generated field away (false life's healing).
  const kept = Object.entries({ ...entry, ...rest } as Record<string, unknown>).filter(([, value]) => value !== null);
  const out: Entry = Object.fromEntries(kept) as Entry;
  if (features) {
    const known = (Array.isArray(entry.features) ? entry.features : []) as Entry[];
    // Features the generated text folds into another (flurry of blows under ki) are added whole.
    const added = Object.entries(features)
      .filter(([id]) => !known.some((f) => f.id === id))
      .map(([id, f]) => ({ id, ...f }));
    out.features = [...known.map((f) => ({ ...f, ...features[f.id] })), ...added];
  }
  // A class's subclasses take their own overlays the same way, by subclass id.
  if (subclasses && Array.isArray(entry.subclasses)) {
    out.subclasses = (entry.subclasses as Entry[]).map((s) => {
      const extra = subclasses[s.id];
      return extra ? merge(s, extra) : s;
    });
  }
  return out;
}

/** A class from a pack or homebrew with the automation written for its id (its rules text stays in the pack). */
export function withClassAutomation(doc: unknown, edition: Edition): unknown {
  const entry = doc as Entry | null;
  return entry && typeof entry.id === 'string' ? withOverlay(entry, classAutomation, edition) : doc;
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

const monsterList = z.array(MonsterSchema);

interface EditionData {
  monsters: unknown[];
  spells: unknown[];
  classes: unknown[];
  /** The edition's weapons, armor, gear and magic items (items-5.x.json). */
  items: unknown[];
  /** The other edition's, whose mundane gear fills in what this one lacks (a 2014 world's musket). */
  otherItems: unknown[];
  /** Gear from the starting kits (packs, holy symbols...) the item lists don't have. */
  gear: unknown[];
}

/** Hand-written items first, then the edition's, the other's mundane gear and the kits' gear, each id once. */
function itemList(data: EditionData): Entry[] {
  const seen = new Set<string>();
  const mundane = (data.otherItems as Entry[]).filter((i) => !i.magic);
  return [handItems, data.items, mundane, data.gear]
    .flat()
    .filter((i) => !seen.has((i as Entry).id) && !!seen.add((i as Entry).id)) as Entry[];
}

/** The overlay with each family key ("vicious-weapon-*") given to every item of the family. */
function families(overlay: Overlay, list: readonly Entry[]): Overlay {
  const keys = Object.keys(overlay).filter((k) => k.endsWith('-*'));
  if (!keys.length) return overlay;
  const out: Overlay = { ...overlay };
  for (const key of keys) {
    const prefix = key.slice(0, -1);
    for (const { id } of list) if (id.startsWith(prefix) && !overlay[id]) out[id] = overlay[key]!;
  }
  return out;
}

function items(data: EditionData, edition: Edition) {
  const list = itemList(data);
  return load(ItemSchema, list, [families(itemAutomation as Overlay, list), edition]);
}

function edition(edition: Edition, data: EditionData): Content {
  return {
    edition,
    items: items(data, edition),
    monsters: byId(withTokenArt(monsterList.parse(data.monsters), tokenArt as Record<string, string>)),
    spells: load(SpellSchema, data.spells, [spellAutomation as Overlay, edition]),
    classes: load(ClassSchema, data.classes, [classAutomation as Overlay, edition]),
  };
}

/** The bundled SRD content (CC-BY-4.0), validated on load: 5.1 for 2014, 5.2 for 2024. */
const SRD: Record<Edition, Content> = {
  '2014': edition('2014', {
    ...{ monsters: monsters51, spells: spells51, classes: classes51 },
    ...{ items: items51, otherItems: items52, gear: origins51.gear },
  }),
  '2024': edition('2024', {
    ...{ monsters: monsters52, spells: spells52, classes: classes52 },
    ...{ items: items52, otherItems: items51, gear: origins52.gear },
  }),
};

export function srdFor(edition: Edition): Content {
  return SRD[edition];
}

/** One of D&D's editions: `rules` if it is one, else the default (2014). */
export function toEdition(rules: string | undefined): Edition {
  const parsed = EditionSchema.safeParse(rules);
  return parsed.success ? parsed.data : '2014';
}

/** The edition a token plays by: its own `stats.rules`, else the world's. */
export function editionOf(token: Pick<Token, 'stats'>, world: Pick<World, 'rules'>): Edition {
  return token.stats?.rules ?? toEdition(world.rules);
}
