import { type Rng, roll } from '@vtt/shared';
import type { Token } from './token-schema.ts';
import { type Spell, SpellSchema } from './spell-schema.ts';

// The parts of a spell that depend on a pick or on the target: the option the
// caster chose, hit point tiers (power word kill), and ending other spells
// (dispel magic, remove curse).

/** The spell with the caster's chosen option set over it; the first option when none is named. */
export function withChoice(spell: Spell, choice: string | undefined): Spell {
  if (!spell.choices) return spell;
  const picked = choice === undefined ? spell.choices[0]! : spell.choices.find((c) => c.id === choice);
  if (!picked) throw new Error(`${spell.name} has no option called ${choice}`);
  const fields: Record<string, unknown> = { ...spell, ...picked.set, chosen: picked.id };
  const merged = Object.entries(fields).filter(([, v]) => v !== null);
  return SpellSchema.parse(Object.fromEntries(merged));
}

export type Tier = NonNullable<Spell['hpTiers']>[number];

/** The hit point tier a creature with `hp` falls in: the lowest one it's within. */
export function tierFor(spell: Spell, hp: number): Tier | undefined {
  const tiers = [...(spell.hpTiers ?? [])].sort((a, b) => a.atMost - b.atMost);
  return tiers.find((t) => hp <= t.atMost);
}

/** The spell as it lands on a creature in `tier`: the tier's effect in place of the spell's own. */
export function tierSpell(spell: Spell, tier: Tier): Spell {
  return { ...spell, effect: tier.effect };
}

/**
 * Effects a dispel ends on the target. A list names the spells it ends; `true`
 * ends any spell of the dispel's slot or lower, and a higher one on a
 * spellcasting check against 10 + its level.
 */
export function dispelled(
  spell: Spell,
  token: Token,
  { slot, mod, rng }: { slot: number; mod: number; rng: Rng },
): string[] | undefined {
  const fromSpells = (token.effects ?? []).filter((e) => e.spell);
  const ended = fromSpells.filter((e) => {
    if (spell.dispels !== true) return spell.dispels?.includes(e.spell!) ?? false;
    const level = e.slot ?? 0;
    return level <= slot || roll(`1d20+${mod}`, rng).total >= 10 + level;
  });
  return ended.length ? ended.map((e) => e.id) : undefined;
}
