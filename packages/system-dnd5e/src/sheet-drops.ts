import { classLevels } from './multiclass.ts';
import { type CasterSheet, classFeature } from './classes.ts';
import type { Content } from './content.ts';
import type { Creature } from './creature.ts';
import type { Spell } from './spell-schema.ts';
import type { Edition, InventoryEntry, Stats } from './stats-schema.ts';

// Dragging things onto a character sheet, as in Foundry: an item goes in the
// inventory, a spell is learnt (or becomes a scroll when it lands in the
// inventory), a class feature is granted on top of the class. Carried items
// can also be handed to another creature.

/** The part of the sheet something was dropped on; undefined for the rest of it. */
export type SheetArea = 'inventory' | 'spells' | 'features';

/** What can be dropped on a sheet from the Compendium. */
export type CompendiumDrop =
  | { kind: 'item'; id: string }
  | { kind: 'spell'; id: string; rules: Edition }
  | { kind: 'feature'; id: string; class: string; rules: Edition };

/** The id of the gear a spell scroll is. */
export const SPELL_SCROLL = 'spell-scroll';

/** The fields of a token or actor that drops change. */
interface Sheet {
  name: string;
  stats?: Stats;
  inventory?: InventoryEntry[];
}

export type DropOutcome<T> = { sheet: T } | { problem: string };

/** What `sheet` becomes when `what` is dropped on its `area`, looked up in the creature's own rules (`content`). */
export function dropOnSheet<T extends Sheet>(
  sheet: T,
  what: CompendiumDrop,
  area: SheetArea | undefined,
  content: Content,
): DropOutcome<T> {
  if (what.kind === 'item') {
    if (!content.items.has(what.id)) return { problem: `There is no item "${what.id}"` };
    return { sheet: { ...sheet, inventory: stacked(sheet.inventory, { item: what.id, qty: 1, equipped: false }) } };
  }
  if (what.kind === 'feature') return grant(sheet, `${what.class}/${what.id}`, content);
  const spell = content.spells.get(what.id);
  if (!spell)
    return { problem: `${sheet.name} plays by the ${content.edition} rules, which have no spell "${what.id}"` };
  if (area === 'inventory') {
    const scroll = { item: SPELL_SCROLL, spell: spell.id, qty: 1, equipped: false };
    return { sheet: { ...sheet, inventory: stacked(sheet.inventory, scroll) } };
  }
  return learn(sheet, spell);
}

const sameKind = (a: InventoryEntry, b: Pick<InventoryEntry, 'item' | 'spell'>) =>
  a.item === b.item && a.spell === b.spell;

/** `entry` added to `list`: onto a stack of the same thing (a scroll of the same spell), or at the end. */
function stacked(list: readonly InventoryEntry[] = [], entry: InventoryEntry): InventoryEntry[] {
  const at = list.findIndex((e) => sameKind(e, entry));
  if (at < 0) return [...list, entry];
  return list.map((e, i) => (i === at ? { ...e, qty: e.qty + entry.qty } : e));
}

function learn<T extends Sheet>(sheet: T, spell: Spell): DropOutcome<T> {
  const spells = sheet.stats?.spells ?? [];
  if (spells.includes(spell.id)) return { problem: `${sheet.name} already knows ${spell.name}` };
  return { sheet: { ...sheet, stats: { ...sheet.stats, spells: [...spells, spell.id] } } };
}

function grant<T extends Sheet>(sheet: T, ref: string, content: Content): DropOutcome<T> {
  const feature = classFeature(ref, content);
  if (!feature) return { problem: `There is no feature "${ref}" in the ${content.edition} rules` };
  const fromClass = classLevels(sheet, content).some((l) =>
    l.cls?.features.some((f) => f.id === feature.id && f.level <= l.level),
  );
  const granted = sheet.stats?.features ?? [];
  if (fromClass || granted.some((r) => r.endsWith(`/${feature.id}`))) {
    return { problem: `${sheet.name} already has ${feature.name}` };
  }
  return { sheet: { ...sheet, stats: { ...sheet.stats, features: [...granted, ref] } } };
}

/** `from` hands its whole stack of `what` to `to`; it arrives unequipped. */
export function handOver<T extends Sheet>(
  from: T,
  to: T,
  what: Pick<InventoryEntry, 'item' | 'spell'>,
): { from: T; to: T } | { problem: string } {
  const list = from.inventory ?? [];
  const entry = list.find((e) => sameKind(e, what));
  if (!entry) return { problem: `${from.name} doesn't carry that` };
  const rest = list.filter((e) => e !== entry);
  return {
    from: { ...from, inventory: rest.length ? rest : undefined },
    to: { ...to, inventory: stacked(to.inventory, { ...entry, equipped: false }) },
  };
}

/** A spell scroll's save DC and attack bonus by spell level (SRD "Spell Scroll"). */
const SCROLL_NUMBERS: readonly [dc: number, attack: number][] = [
  [13, 5],
  [13, 5],
  [13, 5],
  [15, 7],
  [15, 7],
  [17, 9],
  [17, 9],
  [18, 10],
  [18, 10],
  [19, 11],
];

/** The spellcasting a scroll of `spell` is read with: the scroll's numbers, the reader's caster level (or `level`). */
export function scrollCaster(sheet: Pick<Creature, 'caster'>, spell: Spell, level: number): CasterSheet {
  const [dc, attack] = SCROLL_NUMBERS[spell.level] ?? SCROLL_NUMBERS[9]!;
  const base: CasterSheet = sheet.caster ?? {
    ability: 'int',
    level,
    slots: [],
    left: [],
    pact: false,
    attack,
    dc,
    spells: [],
  };
  return { ...base, dc, attack, spells: [spell] };
}
