import { freeId, slugify } from '@vtt/core';
import type { Content } from './content.ts';
import { abilityMod } from './creature-math.ts';
import { at, list, type Loose, num, obj, opt, plainText, str } from './foundry-data.ts';
import {
  type Abilities,
  type Attack,
  type DamageType,
  DamageTypeSchema,
  type InventoryEntry,
  type Item,
  type Weapon,
  type WeaponPropertySchema,
} from './stats-schema.ts';
import type { z } from 'zod';

// The items on a Foundry dnd5e actor as ours: SRD items by name in the
// inventory, the rest as items of its own; an NPC's weapons as attacks.

type WeaponProperty = z.infer<typeof WeaponPropertySchema>;

const GEAR_TYPES = new Set(['weapon', 'equipment', 'consumable', 'tool', 'loot', 'backpack', 'container']);

/** The names an SRD id might have: "Leather Armor" is leather, "Crossbow, light" is light-crossbow. */
function candidates(name: string): string[] {
  const slug = slugify(name);
  const [a, b] = name.split(',');
  const turned = b ? [slugify(`${b} ${a}`)] : [];
  return [slug, slug.replace(/-armor$/, ''), ...turned];
}

/** The id under which `map` has something called `name`. */
export function byName<T>(map: ReadonlyMap<string, T>, name: string): string | undefined {
  return candidates(name).find((id) => map.has(id));
}

const PROPERTIES: Record<string, WeaponProperty> = {
  amm: 'ammunition',
  fin: 'finesse',
  hvy: 'heavy',
  lgt: 'light',
  lod: 'loading',
  rch: 'reach',
  thr: 'thrown',
  two: 'two-handed',
  ver: 'versatile',
};

/** dnd5e 4+ keeps properties as a list of codes, earlier versions as an object of flags. */
function propertiesOf(sys: Loose): WeaponProperty[] {
  const raw = sys.properties;
  const codes = Array.isArray(raw) ? raw : Object.keys(obj(raw)).filter((k) => obj(raw)[k] === true);
  return codes.flatMap((c) => (typeof c === 'string' && PROPERTIES[c] ? [PROPERTIES[c]] : []));
}

const damageType = (x: unknown): DamageType | undefined => DamageTypeSchema.safeParse(x).data;

interface WeaponDamage {
  dice: string;
  type: DamageType;
  /** Whether the ability modifier is added. */
  withMod: boolean;
}

/** dnd5e 4+: `damage.base` { number, denomination, bonus, types }; before: `damage.parts` [[formula, type]]. */
function damageOf(sys: Loose): WeaponDamage | undefined {
  const base = obj(at(sys, 'damage.base'));
  const [n, die] = [num(base.number), num(base.denomination)];
  if (n && die) {
    const type = damageType(list(base.types)[0]);
    const bonus = num(base.bonus);
    return type && { dice: `${n}d${die}${bonus ? signed(bonus) : ''}`, type, withMod: true };
  }
  const [formula, type] = list(list(at(sys, 'damage.parts'))[0]);
  const text = str(formula)?.replace(/\s+/g, '');
  const dice = text?.replace(/\+?@mod/g, '');
  if (!dice || !/^\d+d\d+([+-]\d+)?$/.test(dice) || !damageType(type)) return undefined;
  return { dice, type: damageType(type)!, withMod: text!.includes('@mod') };
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n || ''));

const isRanged = (sys: Loose) =>
  (str(at(sys, 'type.value')) ?? str(sys.weaponType) ?? '').endsWith('R') ||
  ['rwak', 'rsak'].includes(str(sys.actionType) ?? '');

const rangeOf = (sys: Loose): [number, number] | undefined => {
  const [normal, long] = [num(at(sys, 'range.value')), num(at(sys, 'range.long'))];
  return normal ? [normal, Math.max(normal, long ?? normal)] : undefined;
};

/** A Foundry weapon as an own weapon item, or undefined if its damage can't be read. */
function weaponOf(id: string, name: string, sys: Loose): Weapon | undefined {
  const dmg = damageOf(sys);
  if (!dmg) return undefined;
  const ranged = isRanged(sys);
  const category = (str(at(sys, 'type.value')) ?? str(sys.weaponType) ?? '').startsWith('martial')
    ? 'martial'
    : 'simple';
  return {
    type: 'weapon',
    id,
    name,
    weight: weightOf(sys),
    category,
    kind: ranged ? 'ranged' : 'melee',
    damage: { dice: dmg.dice, type: dmg.type },
    properties: propertiesOf(sys),
    ...opt('range', ranged && (rangeOf(sys) ?? [80, 320])),
  };
}

const weightOf = (sys: Loose) => num(at(sys, 'weight.value')) ?? num(sys.weight) ?? 0;

const ARMOR = new Set(['light', 'medium', 'heavy', 'shield']);

/** A Foundry item we have no SRD match for, as an own item. */
function ownItem(id: string, item: Loose): Item {
  const [name, sys] = [str(item.name) ?? 'Item', obj(item.system)];
  const weapon = item.type === 'weapon' ? weaponOf(id, name, sys) : undefined;
  if (weapon) return weapon;
  const armor = str(at(sys, 'type.value')) ?? str(at(sys, 'armor.type'));
  const ac = num(at(sys, 'armor.value'));
  if (item.type === 'equipment' && armor && ARMOR.has(armor) && ac !== undefined)
    return {
      type: 'armor',
      id,
      name,
      weight: weightOf(sys),
      category: armor as 'light',
      ac,
      stealthDisadvantage: false,
    };
  const description = plainText(str(at(sys, 'description.value')) ?? '');
  return { type: 'gear', id, name, weight: weightOf(sys), ...opt('description', description || undefined) };
}

export interface Gear {
  inventory: InventoryEntry[];
  own: Item[];
}

/** A character's (or an unmatched NPC's) gear: SRD items by name, the rest its own. */
export function gearOf(items: Loose[], srd: Content): Gear {
  const out: Gear = { inventory: [], own: [] };
  for (const item of items) {
    const name = str(item.name);
    if (!GEAR_TYPES.has(String(item.type)) || !name) continue;
    let id = byName(srd.items, name);
    if (!id) {
      id = freeId(slugify(name) || 'item', (x) => srd.items.has(x) || out.own.some((o) => o.id === x), { bare: true });
      out.own.push(ownItem(id, item));
    }
    const sys = obj(item.system);
    const qty = num(sys.quantity);
    out.inventory.push({
      item: id,
      ...opt('equipped', sys.equipped === true),
      ...opt('qty', qty !== undefined && qty > 1 && Math.round(qty)),
    } as InventoryEntry);
  }
  return out;
}

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/** The ability a weapon attacks with: finesse takes the better of STR and DEX, ranged DEX. */
function attackAbility(w: Weapon, sys: Loose, scores: Abilities): (typeof ABILITY_KEYS)[number] {
  const chosen = str(sys.ability);
  if (chosen && (ABILITY_KEYS as readonly string[]).includes(chosen)) return chosen as 'str';
  if (w.properties.includes('finesse')) return scores.dex > scores.str ? 'dex' : 'str';
  return w.kind === 'ranged' ? 'dex' : 'str';
}

function srdWeapon(name: string, srd: Content): Weapon | undefined {
  const item = srd.items.get(byName(srd.items, name) ?? '');
  return item?.type === 'weapon' ? item : undefined;
}

/** An NPC's weapon as a ready-to-roll attack: its own data, else the SRD weapon's. */
export function attackOf(item: Loose, srd: Content, scores: Abilities, proficiency: number): Attack | undefined {
  const [name, sys] = [str(item.name) ?? 'Attack', obj(item.system)];
  const weapon = weaponOf('x', name, sys) ?? srdWeapon(name, srd);
  if (!weapon) return undefined;
  const mod = abilityMod(scores[attackAbility(weapon, sys, scores)]);
  const withMod = damageOf(sys)?.withMod ?? true;
  const dice = withMod ? addTo(weapon.damage.dice, mod) : weapon.damage.dice;
  const reach = weapon.properties.includes('reach') ? 10 : 5;
  return {
    name,
    kind: weapon.kind,
    toHit: proficiency + mod + (num(at(sys, 'attack.bonus')) ?? 0),
    ...(weapon.kind === 'ranged' ? { range: weapon.range ?? [80, 320] } : { reach }),
    damage: [{ dice, type: weapon.damage.type }],
  };
}

/** "2d6" plus -1 is "2d6-1"; "1d8+1" plus 2 is "1d8+3". */
function addTo(dice: string, mod: number): string {
  const [, base, extra] = /^(\d+d\d+)([+-]\d+)?$/.exec(dice) ?? [];
  return base ? `${base}${signed(Number(extra ?? 0) + mod)}` : dice;
}
