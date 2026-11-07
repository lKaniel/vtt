import { bare, str } from './srd-convert.ts';
import type { ItemEntry } from './item-convert.ts';

// The spells a magic item casts and what each costs, read from the packs:
// a wand of fireballs casts fireball for 1 charge (and 1 more per slot
// level above 3rd), a staff of healing cure wounds for its slot level in
// charges, an amulet of the planes plane shift at will.

type Rec = Record<string, unknown>;

/** One spell the item casts: `cost` charges ("level": as many as the slot level, less `less`), at `level`, or once a day. */
interface Cast {
  spell: string;
  cost?: number | 'level';
  less?: number;
  level?: number;
  daily?: boolean;
}

interface CostOption {
  when: string;
  by: unknown;
  slot?: number;
  daily: boolean;
}

const SPELL_REF = /@spells\.([a-z0-9-]+)/g;
/** A number or a string as text; anything else as nothing. */
const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const refs = (s: string) => [...s.matchAll(SPELL_REF)].map((m) => m[1]!);

function costOptions(e: ItemEntry): CostOption[] {
  return (e.effects ?? []).flatMap((x) => {
    const fx = x as { target?: Rec; when?: unknown; value?: Rec };
    if (!(fx.target?.choices as string[] | undefined)?.includes('spell-cost')) return [];
    const changes = (fx.value?.changes as Rec[] | undefined) ?? [];
    const charge = changes.find((c) => c.type === 'adjustState' && c.key === 'charges');
    const daily = changes.some((c) => c.key === 'usedToday' || c.key === 'used');
    const slot = (fx.value?.flags as Rec | undefined)?.slot;
    return [{ when: text(fx.when), by: charge?.by, slot: typeof slot === 'number' ? slot : undefined, daily }];
  });
}

/** What `by` (the change to the charges) costs for `spell`. */
function costFor(by: unknown, spell: string, all: readonly string[]): Pick<Cast, 'cost' | 'less'> | undefined {
  if (typeof by === 'number') return { cost: -by };
  const s = text(by).replace(/\s+/g, ' ').trim();
  if (/^-?\d+$/.test(s)) return { cost: Math.abs(Number(s)) };
  if (s === '-flags.slot') return { cost: 'level' };
  const less = /^-\(flags\.slot - (\d+)\)$/.exec(s);
  if (less) return { cost: 'level', less: Number(less[1]) };
  const listed = /^-\[([\d, ]+)\]\[indexOf\(/.exec(s);
  if (listed) return { cost: Number(listed[1]!.split(',')[all.indexOf(spell)]) };
  return chained(s, spell);
}

/** "-(action.item.id == @spells.a ? 1 : action.item.id == @spells.b ? flags.slot : 5)". */
function chained(s: string, spell: string): Pick<Cast, 'cost'> | undefined {
  const parts = [...s.matchAll(/@spells\.([a-z0-9-]+) \? ([\w.]+)/g)];
  const hit = parts.find((m) => m[1] === spell);
  const value = hit?.[2] ?? /: (\d+)\)$/.exec(s)?.[1];
  if (value === undefined) return undefined;
  return { cost: value === 'flags.slot' ? 'level' : Number(value) };
}

/** Potions name the spell they work like (haste for speed) without casting it. */
function grantedSpells(e: ItemEntry): string[] {
  const grants = (e.grants ?? []).map((g) => g.item).filter((i) => i.startsWith('spells.'));
  const potion = e.fields?.category === 'potion';
  const listed = potion
    ? []
    : ((e.fields?.spells as string[] | undefined) ?? []).filter((i) => i.startsWith('spells.'));
  return [...new Set([...grants, ...listed].map(bare))];
}

function atWill(e: ItemEntry): Set<string> {
  const out = new Set<string>();
  for (const x of e.effects ?? []) {
    const fx = x as { target?: unknown; value?: Rec };
    const item = str(fx.value?.item);
    if (fx.target === 'spells.atWill' && item) out.add(bare(item));
  }
  return out;
}

/** The fixed slot level `when` casts the spell at ("flags.slot == 5"). */
function fixedLevel(when: string, spell: string): number | undefined {
  const near = new RegExp(`@spells\\.${spell}\\b[^|]*?flags\\.slot == (\\d)`).exec(when);
  return near ? Number(near[1]) : undefined;
}

/** The cost option naming the spell, or the item's only one. */
function optionFor(spell: string, options: readonly CostOption[]): CostOption | undefined {
  return options.find((o) => refs(o.when).includes(spell)) ?? (options.length === 1 ? options[0] : undefined);
}

/** An item with no charges that names no cost casts its spell once a day (a cloak of arachnida's web). */
function castOf(spell: string, options: readonly CostOption[], free: ReadonlySet<string>, charged: boolean): Cast {
  if (free.has(spell)) return { spell, cost: 0 };
  const option = optionFor(spell, options);
  if (!option) return charged ? { spell, cost: 1 } : { spell, daily: true };
  const level = option.slot ?? fixedLevel(option.when, spell);
  if (option.daily && option.by === undefined) return { spell, daily: true, ...(level && { level }) };
  const cost = costFor(option.by, spell, refs(text(option.by)));
  return { spell, ...(cost ?? { daily: true }), ...(level && { level }) };
}

/** The spells the item casts, their costs, and its charges. */
export function itemCasts(e: ItemEntry): Rec {
  const f = e.fields ?? {};
  const max = typeof f.maxCharges === 'number' ? f.maxCharges : undefined;
  const options = costOptions(e);
  const free = atWill(e);
  const casts = grantedSpells(e).map((s) => castOf(s, options, free, !!max));
  const recharge = typeof f.recharge === 'string' ? f.recharge.replace(/\s+/g, '') : undefined;
  return {
    ...(casts.length && { casts }),
    ...(max && { charges: { max, ...(recharge && { recharge }) } }),
    ...(typeof f.saveDc === 'number' && { dc: f.saveDc }),
  };
}
