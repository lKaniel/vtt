import { contest } from './checks.ts';
import { rollSpellSave, type Affected, type SaveRoll } from './effects.ts';
import { resistSave } from './legendary.ts';
import type { Cast, CastSide } from './spells.ts';
import type { Spell } from './spell-schema.ts';

// The save a creature makes as a spell lands on it, and evasion: against a
// Dex save for half damage, a success takes nothing and a failure only half.

/** The target's save when the spell lands, against the spell's own DC or the caster's; none when it saves only later. */
export function castSave(cast: Cast, target: CastSide): SaveRoll | undefined {
  const { spell, dc, rng } = cast;
  if (!spell.save?.onCast) return undefined;
  if (spell.save.contest) return contest(spell.save.ability, cast.caster, target, rng);
  const save = { ability: spell.save.ability, dc: spell.save.dc ?? dc, vs: spell.effect?.conditions ?? [] };
  return resistSave(target.sheet, rollSpellSave(target.sheet, save, rng));
}

interface Landing<A> {
  attack: A;
  save: SaveRoll | undefined;
  landed: boolean;
  half: boolean;
}

/** How a spell lands on a creature with evasion: no damage on a saved Dex save for half, half on a failed one. */
export function withEvasion<A>(sheet: Affected, spell: Spell, landing: Landing<A>): Landing<A> {
  const { save } = landing;
  const evades = sheet.effects.some((e) => e.evasion) && save?.ability === 'dex' && spell.save?.onSave === 'half';
  if (!evades) return landing;
  return save.success ? { ...landing, landed: false, half: false } : { ...landing, landed: true, half: true };
}
