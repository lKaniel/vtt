import type { Spell } from './spell-schema.ts';

// A spell at the slot it's cast with: more dice, healing, targets and beams
// per level above its own, and cantrips growing with the caster's level.

/** Character levels at which cantrips grow. */
export const CANTRIP_TIERS = [5, 11, 17];

/** The number of dice in "2d6" (2) or "d6" (1). */
const diceCount = (count: string | undefined) => (count ? Number(count) : 1);

/** "8d6" plus "1d6" twice is "10d6"; dice of another size are added on, e.g. "1d6+2d8". */
function addDice(base: string, per: string | undefined, times: number): string {
  const p = per ? /^(\d*)d(\d+)$/.exec(per) : null;
  if (!p || times <= 0) return base;
  const extra = times * diceCount(p[1]);
  const m = /^(\d*)d(\d+)/.exec(base);
  if (!m || m[2] !== p[2]) return `${base}+${extra}d${p[2]}`;
  return `${diceCount(m[1]) + extra}d${m[2]}${base.slice(m[0].length)}`;
}

/** Multiplies the dice of a formula: cantrip damage at higher levels. */
function timesDice(formula: string, n: number): string {
  return formula.replace(/^(\d*)d/, (_, c: string) => `${diceCount(c) * n}d`);
}

/** Healing, temporary hit points and hit point pools at a higher slot. */
function upcastPools(spell: Spell, extra: number): Pick<Spell, 'heal' | 'tempHp' | 'hpPool' | 'effect'> {
  const tempBonus = extra * (spell.upcast?.tempHp ?? 0);
  return {
    ...raisedMaximum(spell, extra),
    tempHp: spell.tempHp && (tempBonus ? `${spell.tempHp}+${tempBonus}` : spell.tempHp),
    hpPool: spell.hpPool && addDice(spell.hpPool, spell.upcast?.hpPool, extra),
  };
}

/** Healing, and for aid a raised maximum healed with it, at a higher slot. */
function raisedMaximum(spell: Spell, extra: number): Pick<Spell, 'heal' | 'effect'> {
  const heal = spell.heal && addDice(spell.heal, spell.upcast?.heal, extra);
  const bonus = extra * (spell.upcast?.maxHp ?? 0);
  if (!bonus || !spell.effect) return { heal, effect: spell.effect };
  return { heal: heal && `${heal}+${bonus}`, effect: { ...spell.effect, maxHp: (spell.effect.maxHp ?? 0) + bonus } };
}

/** The spell as it works when cast with `slot` by a caster of `casterLevel`. */
export function scaledSpell(spell: Spell, slot: number, casterLevel: number): Spell & { beams: number } {
  const extra = Math.max(0, slot - spell.level);
  const tier = 1 + CANTRIP_TIERS.filter((l) => casterLevel >= l).length;
  const cantrip = spell.level === 0 ? spell.cantrip : undefined;
  const damage = spell.damage.map((d) => ({
    ...d,
    dice: cantrip === 'dice' ? timesDice(d.dice, tier) : addDice(d.dice, spell.upcast?.damage, extra),
  }));
  const baseBeams = spell.beams ?? 1;
  return {
    ...spell,
    damage,
    ...upcastPools(spell, extra),
    targets: spell.targets + extra * (spell.upcast?.targets ?? 0),
    beams: cantrip === 'beams' ? baseBeams + tier - 1 : baseBeams + extra * (spell.upcast?.beams ?? 0),
  };
}
