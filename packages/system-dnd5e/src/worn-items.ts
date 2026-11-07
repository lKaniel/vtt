import { itemWorks } from './carrying.ts';
import type { Content } from './content.ts';
import type { Creature } from './creature.ts';
import type { Item, Weapon } from './item-schema.ts';
import type { Effect } from './spell-schema.ts';
import { ABILITIES, type Attack } from './stats-schema.ts';
import type { Token } from './token-schema.ts';

// What magic items do while worn: their effects join the bearer's, their
// bonuses go on its AC, saves and spells, and a magic weapon's +1 and extra
// damage go on its attack.

/** The inventory's items that work now: equipped, and attuned if they need it. */
function working(token: Token, content: Content): { key: string; item: Item }[] {
  return (token.inventory ?? []).flatMap((e, i) => {
    const item = content.items.get(e.item);
    return item && itemWorks(e, item) ? [{ key: e.id ?? `${e.item}-${i}`, item }] : [];
  });
}

/** The effects of the items `token` wears, as effects on it (named after the item). */
function itemEffects(token: Token, content: Content): Effect[] {
  return working(token, content).flatMap(({ key, item }) =>
    item.effect ? [{ ...item.effect, id: `item-${key}`, name: item.effect.name ?? item.name, source: token.id }] : [],
  );
}

/** The token with its worn items' effects added to its own, for working out its sheet. */
export function wearing(token: Token, content: Content): Token {
  const effects = itemEffects(token, content);
  return effects.length ? { ...token, effects: [...(token.effects ?? []), ...effects] } : token;
}

/** Worn items' bonuses to AC, saving throws, spell attacks and save DCs (a ring of protection, a wand of the war mage). */
export function withItemBonuses(c: Creature, token: Token, content: Content): Creature {
  const bonuses = working(token, content).flatMap(({ item }) => (item.bonus ? [item.bonus] : []));
  if (!bonuses.length) return c;
  const total = (key: 'ac' | 'saves' | 'spellAttack' | 'spellDc') => bonuses.reduce((n, b) => n + (b[key] ?? 0), 0);
  const save = total('saves');
  const saves = Object.fromEntries(ABILITIES.map((a) => [a, c.saves[a] + save])) as Creature['saves'];
  const caster = c.caster && {
    ...c.caster,
    attack: c.caster.attack + total('spellAttack'),
    dc: c.caster.dc + total('spellDc'),
  };
  return { ...c, ac: c.ac + total('ac'), saves, ...(caster && { caster }) };
}

/** "1d8+3" plus 1 is "1d8+4". */
function plusDamage(dice: string, plus: number): string {
  const m = /^(.*?)([+-]\d+)$/.exec(dice);
  const total = Number(m?.[2] ?? 0) + plus;
  const base = m ? m[1]! : dice;
  if (!total) return base;
  return total > 0 ? `${base}+${total}` : `${base}${total}`;
}

/** The best magic ammunition the token has ready (arrows +1): what a weapon that fires it adds. */
export function ammunitionPlus(token: Token, content: Content): number {
  const plus = (token.inventory ?? [])
    .filter((e) => e.equipped)
    .map((e) => content.items.get(e.item))
    .map((i) => (i?.type === 'gear' && i.group === 'ammunition' ? (i.plus ?? 0) : 0));
  return Math.max(0, ...plus);
}

/** A weapon attack with the weapon's magic: its +N (or its ammunition's) and its extra damage on hits. */
export function withWeaponMagic(attack: Attack, weapon: Weapon, ammunition: number): Attack {
  const plus = (weapon.plus ?? 0) + (weapon.properties.includes('ammunition') ? ammunition : 0);
  const [first, ...rest] = attack.damage;
  const damage = plus ? [{ ...first!, dice: plusDamage(first!.dice, plus) }, ...rest] : attack.damage;
  const riders = weapon.hitDamage?.length ? { hitDamage: weapon.hitDamage } : {};
  return {
    ...attack,
    toHit: attack.toHit + plus,
    damage,
    ...(attack.weapon && { weapon: { ...attack.weapon, ...riders } }),
  };
}

/** Flying, swimming and climbing speeds the effects give; "walk" is as fast as it walks. */
export function otherSpeeds(effects: readonly Effect[], walk: number): Creature['speeds'] {
  const out: NonNullable<Creature['speeds']> = {};
  const given = effects.flatMap((e) => (e.speeds ? [e.speeds] : []));
  for (const kind of ['fly', 'swim', 'climb'] as const) {
    const feet = given.flatMap((s) => (s[kind] === undefined ? [] : [s[kind] === 'walk' ? walk : s[kind]]));
    if (feet.length) out[kind] = Math.max(...feet);
  }
  if (given.some((s) => s.hover)) out.hover = true;
  return Object.keys(out).length ? out : undefined;
}
