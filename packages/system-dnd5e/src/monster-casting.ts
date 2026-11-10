import { type CasterSheet, casterSheet } from './classes.ts';
import type { Content } from './content.ts';
import { abilityMod } from './creature-math.ts';
import type { Monster } from './monster-schema.ts';
import type { Spell } from './spell-schema.ts';
import type { Abilities } from './stats-schema.ts';
import type { Token } from './token-schema.ts';

// A monster's spellcasting: its stat block's save DC, attack bonus and slots,
// and every spell it can cast. Spells it casts at will or so many times a
// day are paid by its features (free-casts.ts), not by slots.

interface Basics {
  abilities: Abilities;
  proficiency: number;
}

/** The caster a stat block makes of the creature, or the one its class does. */
export function casterOf(
  token: Token,
  monster: Monster | undefined,
  basics: Basics,
  content: Content,
): CasterSheet | undefined {
  const casting = monster?.spellcasting;
  if (!casting) return casterSheet(token, basics, content);
  const worked = 8 + basics.proficiency + abilityMod(basics.abilities[casting.ability]);
  const dc = casting.dc ?? worked;
  const slots = casting.slots ?? [];
  const spent = token.spent?.slots ?? [];
  return {
    ability: casting.ability,
    attack: casting.attack ?? dc - 8,
    dc,
    level: casting.level ?? 1,
    slots,
    left: slots.map((n, i) => Math.max(0, n - (spent[i] ?? 0))),
    pact: false,
    spells: casting.spells.map((id) => content.spells.get(id)).filter((s): s is Spell => !!s),
  };
}
