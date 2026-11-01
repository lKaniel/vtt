import type { Content } from './content.ts';
import { type Feature, FeatureSchema, type Spell, SpellSchema } from './spell-schema.ts';
import { type InventoryEntry, type Item, ItemSchema } from './stats-schema.ts';
import type { Own } from './token-schema.ts';

// Things made on a sheet rather than taken from a compendium (Foundry's
// "Create item"): the sheet's `own` items, spells and features, read as if
// the compendium had them. Dragging from a compendium adds what exists.

interface Sheet {
  own?: Own;
}

const cache = new WeakMap<Own, WeakMap<Content, Content>>();

const joined = <T extends { id: string }>(base: ReadonlyMap<string, T>, mine: readonly T[] = []) =>
  mine.length ? new Map([...base, ...mine.map((x) => [x.id, x] as const)]) : base;

/** `content` plus the sheet's own items and spells (they win over a compendium entry of the same id). */
export function withOwn(content: Content, sheet: Sheet): Content {
  const own = sheet.own;
  if (!own?.items?.length && !own?.spells?.length) return content;
  const known = cache.get(own) ?? new WeakMap<Content, Content>();
  cache.set(own, known);
  const hit = known.get(content);
  if (hit) return hit;
  const mine = { ...content, items: joined(content.items, own.items), spells: joined(content.spells, own.spells) };
  known.set(content, mine);
  return mine;
}

/** The ids of the spells a sheet knows: those it learnt, then the ones made on it. */
export function knownSpellIds(sheet: Sheet & { stats?: { spells?: string[] } }): string[] {
  const learnt = sheet.stats?.spells ?? [];
  return [...learnt, ...(sheet.own?.spells ?? []).map((s) => s.id).filter((id) => !learnt.includes(id))];
}

/** The features made on a sheet, granted on top of its class's. */
export const ownFeatures = (sheet: Sheet): Feature[] => sheet.own?.features ?? [];

export type OwnKind = 'item' | 'spell' | 'feature';

/** `base`, or `base-2`, `base-3`... whichever `taken` doesn't have yet. */
function freeId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// Parsed, so a blank one has every default its schema gives (an empty damage list...).
const BLANK = {
  item: (id: string): Item => ItemSchema.parse({ type: 'gear', id, name: 'New item', weight: 0 }),
  spell: (id: string): Spell =>
    SpellSchema.parse({ id, name: 'New spell', level: 0, school: 'evocation', castingTime: 'action', range: 0 }),
  feature: (id: string): Feature =>
    FeatureSchema.parse({ id, name: 'New feature', level: 1, description: '', recharge: 'long' }),
};

/** A new, empty item, spell or feature to make on `sheet`, with an id it doesn't use yet. */
export function blankOwn<K extends OwnKind>(kind: K, sheet: Sheet): ReturnType<(typeof BLANK)[K]> {
  const list: { id: string }[] = sheet.own?.[`${kind}s`] ?? [];
  const id = freeId(`new-${kind}`, new Set(list.map((x) => x.id)));
  return BLANK[kind](id) as ReturnType<(typeof BLANK)[K]>;
}

interface EditableSheet extends Sheet {
  inventory?: InventoryEntry[];
}

type OwnOf<K extends OwnKind> = NonNullable<Own[`${K}s`]>[number];

/** `sheet` with its own `kind` list set (left out when empty). */
function withList<T extends EditableSheet, K extends OwnKind>(sheet: T, kind: K, list: readonly OwnOf<K>[]): T {
  const own: Own = { ...sheet.own, [`${kind}s`]: list.length ? list : undefined };
  const empty = !own.items && !own.spells && !own.features;
  return { ...sheet, own: empty ? undefined : own };
}

/** A blank item, spell or feature made on `sheet`; an item also goes in its bag. */
export function makeOwn<T extends EditableSheet>(sheet: T, kind: OwnKind): { sheet: T; id: string } {
  const made = blankOwn(kind, sheet);
  const next = withList(sheet, kind, [...(sheet.own?.[`${kind}s`] ?? []), made] as OwnOf<typeof kind>[]);
  if (kind !== 'item') return { sheet: next, id: made.id };
  const inventory = [...(sheet.inventory ?? []), { item: made.id, qty: 1, equipped: false }];
  return { sheet: { ...next, inventory }, id: made.id };
}

/** `sheet` with its own `entry` (matched by id) replaced. */
export function changeOwn<T extends EditableSheet, K extends OwnKind>(sheet: T, kind: K, entry: OwnOf<K>): T {
  const list = (sheet.own?.[`${kind}s`] ?? []) as OwnOf<K>[];
  return withList(
    sheet,
    kind,
    list.map((x) => (x.id === entry.id ? entry : x)),
  );
}

/** `sheet` without its own `id`; an item also leaves the bag. */
export function dropOwn<T extends EditableSheet>(sheet: T, kind: OwnKind, id: string): T {
  const list = (sheet.own?.[`${kind}s`] ?? []) as { id: string }[];
  const next = withList(sheet, kind, list.filter((x) => x.id !== id) as OwnOf<typeof kind>[]);
  if (kind !== 'item' || !sheet.inventory) return next;
  const inventory = sheet.inventory.filter((e) => e.item !== id);
  return { ...next, inventory: inventory.length ? inventory : undefined };
}
