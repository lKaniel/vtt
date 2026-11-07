import { bare, type Entry, type Pack, str } from './srd-convert.ts';
import { itemEffects, type ItemParts } from './item-effects-convert.ts';

// Turns the SRD packs' weapons, armor, gear, tools and magic items into our
// items, the way Foundry's dnd5e compendium lists them: a template like
// "Weapon, +1" or "Flame Tongue" becomes one item per weapon it fits
// ("Longsword +1", "Flame Tongue Greatsword"), and an item whose damage type
// is picked becomes one per type ("Ring of Resistance (Fire)"). What the
// packs automate becomes our effects (item-effects-convert.ts); the rest is
// reported, and written by hand in content/srd/item-automation.json.

type Fields = Record<string, unknown>;
type Out = Record<string, unknown> & { id: string; name: string; type: string };
export interface ItemEntry extends Entry {
  tags?: string[];
  appliesTo?: { type: string; where?: string };
  effectsWhen?: unknown;
  actions?: { use?: string; id?: string }[];
  state?: Record<string, { type?: string; values?: string[] }>;
  choices?: { id: string; from?: { values?: unknown[] } }[];
}

const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const formula = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, '') : undefined;
/** Drops undefined, false and empty fields so the JSON stays small. */
function clean<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== false && !(Array.isArray(v) && !v.length)),
  ) as T;
}

/** Ids our older items.json used, kept so worlds that carry them still work. */
const LEGACY: Record<string, string> = {
  'hooded-lantern': 'lantern-hooded',
  'bullseye-lantern': 'lantern-bullseye',
  oil: 'oil-flask',
  'hempen-rope': 'rope',
  'healers-kit': 'healer-s-kit',
};
const ourId = (ref: string) => {
  const id = bare(ref)
    .replace(/-plus-one\b/, '-plus-1')
    .replace(/-plus-two\b/, '-plus-2')
    .replace(/-plus-three\b/, '-plus-3');
  return LEGACY[id] ?? id;
};

const nameOf = (pack: Pack, e: Entry) => pack.text[`${e.id}.name`] ?? bare(e.id);
function textOf(pack: Pack, e: Entry): string | undefined {
  const text = pack.text[`${e.id}.description`]?.trim();
  return text === '' ? undefined : text;
}

// ---- Mundane ------------------------------------------------------------

/** "Plate armor" as Foundry writes it: "Plate Armor". */
const titled = (name: string) => name.replace(/\b(armor|mail|shirt)\b/g, (w) => w[0]!.toUpperCase() + w.slice(1));

const PROPERTIES = ['ammunition', 'finesse', 'heavy', 'light', 'loading', 'reach', 'thrown', 'two-handed', 'versatile'];

function properties(tags: readonly string[]): string[] {
  const words = tags.map((t) => t.replace(/^property\./, ''));
  return PROPERTIES.filter((p) => words.includes(p));
}

function weapon(pack: Pack, e: ItemEntry): Out {
  const f = e.fields ?? {};
  const ranged = f.range === 'ranged';
  const [normal, long] = [num(f.normalRange), num(f.longRange)];
  return clean({
    id: ourId(e.id),
    type: 'weapon',
    name: nameOf(pack, e),
    category: f.category === 'martial' ? 'martial' : 'simple',
    kind: ranged ? 'ranged' : 'melee',
    damage: { dice: formula(f.damage) ?? '1', type: str(f.damageType) ?? 'bludgeoning' },
    properties: properties(e.tags ?? []),
    range: normal ? [normal, Math.max(normal, long ?? normal)] : undefined,
    versatile: formula(f.versatileDamage),
    mastery: str(f.mastery),
    weight: num(f.weight) ?? 0,
    price: num(f.cost),
    description: textOf(pack, e),
  });
}

function armor(pack: Pack, e: ItemEntry): Out {
  const f = e.fields ?? {};
  return clean({
    id: ourId(e.id),
    type: 'armor',
    name: titled(nameOf(pack, e)),
    category: str(f.category) ?? 'light',
    ac: num(f.baseAc) ?? num(f.acBonus) ?? 2,
    strength: num(f.strength),
    stealthDisadvantage: f.stealthDisadvantage === true,
    weight: num(f.weight) ?? 0,
    price: num(f.cost),
    description: textOf(pack, e),
  });
}

function gear(pack: Pack, e: ItemEntry): Out {
  const f = e.fields ?? {};
  const group = e.type === 'tool' ? 'tool' : str(f.category);
  return clean({
    id: ourId(e.id),
    type: 'gear',
    name: nameOf(pack, e),
    group,
    weight: num(f.weight) ?? 0,
    price: num(f.cost),
    description: textOf(pack, e),
  });
}

// ---- Magic --------------------------------------------------------------

const GROUPS: Record<string, string> = { 'wondrous-item': 'wondrous' };

function magicBase(pack: Pack, e: ItemEntry): Out {
  const f = e.fields ?? {};
  const classes = (f.attunementClasses as string[] | undefined)?.map(bare);
  return clean({
    id: ourId(e.id),
    type: 'gear',
    name: nameOf(pack, e),
    group: GROUPS[str(f.category) ?? ''] ?? str(f.category) ?? 'wondrous',
    rarity: str(f.rarity),
    magic: true,
    attunement: f.requiresAttunement === true,
    attunedBy: classes,
    weight: num(f.weight) ?? 0,
    price: num(f.cost),
    description: textOf(pack, e),
  });
}

/** Folds the effects the converter understood into the item; the rest goes to the report. */
function withParts(item: Out, parts: ItemParts, report: string[]): Out {
  for (const miss of parts.missed) report.push(`${item.id}: ${miss}`);
  const { missed: _missed, use, ...rest } = parts;
  const merged: Out = { ...item, ...clean(rest as Record<string, unknown>) };
  if (use && Object.keys(use).length) merged.use = { ...(item.use as object), ...use };
  return merged;
}

function magicItem(pack: Pack, e: ItemEntry, report: string[]): Out[] {
  const item = magicBase(pack, e);
  return pickVariants(e).map((v) =>
    withParts(
      { ...item, id: v.id ? `${item.id}-${v.id}` : item.id, name: v.label ? `${item.name} (${v.label})` : item.name },
      pickedParts(e, v.id),
      report,
    ),
  );
}

// ---- Choices: one item per pick -----------------------------------------

const RESISTANCES = [
  'acid',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'poison',
  'psychic',
  'radiant',
  'thunder',
];
/** Dragon scale mail: the dragon's colour and the damage its scales resist. */
const DRAGONS: Record<string, string> = {
  black: 'acid',
  blue: 'lightning',
  brass: 'fire',
  bronze: 'lightning',
  copper: 'acid',
  gold: 'fire',
  green: 'poison',
  red: 'fire',
  silver: 'cold',
  white: 'cold',
};
const PICKS: Record<string, string[]> = {
  'ring-of-resistance': RESISTANCES,
  'armor-of-resistance': RESISTANCES,
  'potion-of-resistance': RESISTANCES,
  'armor-of-vulnerability': ['bludgeoning', 'piercing', 'slashing'],
  'dragon-scale-mail': Object.keys(DRAGONS),
};

interface Variant {
  id?: string;
  label?: string;
}

const title = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

const PHYSICAL = ['bludgeoning', 'piercing', 'slashing'];

/**
 * The item's effects for one pick. The damage a pick decides is set here,
 * since the packs don't always say it: dragon scale mail resists its
 * dragon's breath, armor of vulnerability resists one physical type and is
 * vulnerable to the other two.
 */
function pickedParts(e: ItemEntry, pick: string | undefined): ItemParts {
  const parts = itemEffects(e, { pick });
  const id = bare(e.id);
  if (!pick || !(id === 'dragon-scale-mail' || id === 'armor-of-vulnerability')) return parts;
  const missed = parts.missed.filter((m) => !m.includes('vulnerabilities'));
  const effect: Record<string, unknown> = { ...parts.effect, resistances: [DRAGONS[pick] ?? pick] };
  if (id === 'armor-of-vulnerability')
    effect.changes = PHYSICAL.filter((t) => t !== pick).map((value) => ({ key: 'vulnerabilities', value }));
  return { ...parts, effect, missed };
}

function pickVariants(e: ItemEntry): Variant[] {
  const picks = PICKS[bare(e.id)];
  return picks ? picks.map((p) => ({ id: p, label: title(p) })) : [{}];
}

// ---- Templates: one item per base it fits -------------------------------

/** The packs' `where` filters ("'sword' in item.tags", "item.id in [@weapons.mace]") as a test. */
function whereTest(where: string | undefined): (base: ItemEntry) => boolean {
  if (!where) return () => true;
  const js = where
    .replace(/@([a-z-]+\.[a-z0-9-]+)/g, "'$1'")
    .replace(/('[^']*')\s+in\s+item\.tags/g, 'item.tags.includes($1)')
    .replace(/(item\.[a-zA-Z]+)\s+in\s+(\[[^\]]*\])/g, '$2.includes($1)');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, sonarjs/code-eval -- the SRD pack's own filter language, run at import time only
  const test = new Function('item', `return (${js});`) as (item: object) => boolean;
  return (base) => test({ ...base.fields, id: base.id, tags: base.tags ?? [] });
}

const PLUS = /^(?:weapon|armor|shield|ammunition)-plus-(\d)$/;

/** "Longsword +1", "Flame Tongue Longsword": the packs write the base as "{base}". */
function variantName(template: string, base: string): string {
  return template.includes('{base}') ? template.replace('{base}', base) : `${template} ${base}`;
}

function templated(pack: Pack, t: ItemEntry, bases: Map<string, { entry: ItemEntry; item: Out }>, report: string[]) {
  const fits = whereTest(t.appliesTo?.where);
  const matching = [...bases.values()].filter((b) => b.entry.type === t.appliesTo?.type && fits(b.entry));
  const single = matching.length === 1;
  const id = ourId(t.id);
  const template = nameOf(pack, t);
  return matching.flatMap(({ entry, item }) =>
    pickVariants(t).map((v) => {
      const plain = PLUS.test(id) ? `${ourId(entry.id)}-plus-${PLUS.exec(id)![1]}` : `${id}-${ourId(entry.id)}`;
      const named = single && !template.includes('{base}') ? template : variantName(template, item.name);
      const out: Out = {
        ...item,
        ...magicFields(magicBase(pack, t)),
        id: (single ? id : plain) + (v.id ? `-${v.id}` : ''),
        name: v.label ? `${named} (${v.label})` : named,
        base: item.id,
        description: textOf(pack, t),
      };
      return withParts(applyFields(out, t.fields ?? {}, t.tags ?? []), pickedParts(t, v.id), report);
    }),
  );
}

function magicFields(m: Out): Out {
  const { id: _id, type: _type, name: _name, weight: _w, price: _p, group: _g, ...rest } = m;
  return rest as Out;
}

/** A template's own numbers on its base: +1 to hit and damage, +1 AC, radiant damage (sun blade). */
function applyFields(item: Out, f: Fields, tags: readonly string[]): Out {
  const out = { ...item };
  const plus = num(f.attackBonus) ?? num(f.damageBonus);
  if (plus) out.plus = plus;
  if (num(f.acBonus)) out.ac = (item.ac as number) + num(f.acBonus)!;
  if (str(f.damageType)) out.damage = { ...(item.damage as object), type: f.damageType };
  if (tags.includes('finesse') && Array.isArray(item.properties) && !item.properties.includes('finesse'))
    out.properties = [...(item.properties as string[]), 'finesse'];
  // Mithral: no stealth disadvantage and no strength requirement.
  if (f.stealthDisadvantage === false || tags.includes('mithral')) {
    out.stealthDisadvantage = false;
    delete out.strength;
  }
  return out;
}

// ---- All ----------------------------------------------------------------

const SKIP = /^magic-items\.(spell-scroll-|stored-spell)/;
const BASE_TYPES = new Set(['weapon', 'armor', 'gear', 'tool']);

function baseItem(pack: Pack, e: ItemEntry): Out {
  if (e.type === 'weapon') return weapon(pack, e);
  if (e.type === 'armor') return armor(pack, e);
  return gear(pack, e);
}

/**
 * Every weapon, armor, gear, tool and magic item of a pack, with the report
 * of what the packs automate that we don't yet. `skip`: ids written by hand
 * in items.json, which win.
 */
export function convertItems(pack: Pack, skip: ReadonlySet<string>): { items: Out[]; report: string[] } {
  const report: string[] = [];
  const entries = [...pack.entries.values()] as ItemEntry[];
  const bases = new Map<string, { entry: ItemEntry; item: Out }>();
  for (const e of entries.filter((x) => BASE_TYPES.has(x.type) && !x.id.startsWith('magic-items.')))
    bases.set(e.id, { entry: e, item: baseItem(pack, e) });
  const magic = entries.filter((e) => e.id.startsWith('magic-items.') && !SKIP.test(e.id));
  const items = [
    ...[...bases.values()].map((b) => b.item),
    ...magic.filter((e) => e.type === 'magicItem').flatMap((e) => magicItem(pack, e, report)),
    ...magic.filter((e) => e.type === 'template').flatMap((t) => templated(pack, t, bases, report)),
  ];
  const seen = new Set<string>();
  const unique = items.filter((i) => !skip.has(i.id) && !seen.has(i.id) && seen.add(i.id));
  unique.sort((a, b) => a.id.localeCompare(b.id));
  return { items: unique, report };
}
