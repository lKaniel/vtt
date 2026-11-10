import type { SpellPicks } from './free-cast-schema.ts';
import type { Spell } from './spell-schema.ts';

// Spells a player picks for a feature to cast without a slot (Feature
// `spellPicks`): a warlock's Mystic Arcanum, a wizard's Spell Mastery and
// Signature Spells, kept on the sheet in `stats.spellPicks`; or, with
// `atCast`, any spell that fits as it is cast (a 2024 cleric's Divine
// Intervention). Each goes off at its own level.

type Choice = SpellPicks['choices'][number];
type Fitting = Pick<Spell, 'id' | 'level' | 'classes' | 'castingTime'>;

/** The choices open at this class level. */
export const openChoices = (picks: SpellPicks, level: number): Choice[] => picks.choices.filter((c) => c.at <= level);

/** Whether `spell` fits `choice`: its level, the class's list, and no reaction when those are left out. */
export function fitsChoice(picks: SpellPicks, choice: Choice, spell: Fitting): boolean {
  if (spell.level === 0 || (choice.level !== undefined && spell.level !== choice.level)) return false;
  if (choice.maxLevel !== undefined && spell.level > choice.maxLevel) return false;
  if (picks.noReactions && spell.castingTime === 'reaction') return false;
  return picks.from !== 'class' || !picks.class || spell.classes.includes(picks.class);
}

const fitsOpen = (picks: SpellPicks, level: number, spell: Fitting) =>
  openChoices(picks, level).some((c) => fitsChoice(picks, c, spell));

/** A feature with spell picks that casts `spell` now: one picked for it, or any that fits when picked as cast. */
export function castsPicked(
  feature: { spellPicks?: SpellPicks; classLevel?: number; picked?: readonly string[] },
  spell: Fitting,
): boolean {
  const picks = feature.spellPicks;
  if (!picks) return false;
  if (!picks.atCast && !feature.picked?.includes(spell.id)) return false;
  return fitsOpen(picks, feature.classLevel ?? 1, spell);
}

/** The spells picked for a feature that count at this class level (to know them). */
export function countedPicks(
  picks: SpellPicks,
  level: number,
  picked: readonly string[],
  spellOf: (id: string) => Fitting | undefined,
): string[] {
  if (picks.atCast) return [];
  return picked.filter((id) => {
    const spell = spellOf(id);
    return !!spell && fitsOpen(picks, level, spell);
  });
}

/** What each open choice may be: the spells that fit it, of `spells` (the class's list, or those the character knows). */
export function pickOptions<S extends Fitting>(picks: SpellPicks, level: number, spells: Iterable<S>): S[][] {
  const all = [...spells];
  return openChoices(picks, level).map((c) => all.filter((s) => fitsChoice(picks, c, s)));
}
