import {
  characterLevel,
  type ClientMessage,
  formChoices,
  type Creature,
  scaledSpell,
  type Spell,
  type TokenView,
} from '@vtt/system-dnd5e';
import { contentFor, gameContent } from '../content/content.ts';
import type { Point } from '@vtt/shared';

// Picking what a spell is aimed at: nothing (self), a point (areas,
// teleports, summons) or some creatures, one per target or beam.

export interface Aiming {
  spell: Spell;
  slot: number;
  mode: 'self' | 'point' | 'creatures';
  /** Creatures picked so far; the same one can appear again for beam spells. */
  picks: string[];
  /** How many picks the spell takes at this slot. */
  need: number;
  /** For summons: the monster to bring. */
  summon?: string;
  /** The spell's option (see Spell `choices`): a damage type, enlarge or reduce. */
  choice?: string;
  /** For shape-shifting spells (polymorph): the monster its targets turn into. */
  form?: string;
  /** Cast without spending a slot. */
  free?: boolean;
  /** Uses a lasting spell again (spiritual weapon): no new slot. */
  repeat?: boolean;
  /** Read from a spell scroll the caster carries. */
  scroll?: boolean;
  /** Cast from the magic item at this inventory index (a wand). */
  item?: number;
  /** Set when a feature is aimed like a spell (bardic inspiration): it's used instead of cast. */
  feature?: string;
}

export function aimSpell(spell: Spell, slot: number, casterLevel: number): Aiming {
  const base = { spell, slot, picks: [], ...(spell.choices && { choice: spell.choices[0]!.id }) };
  if (spell.area || spell.teleport || spell.summon || spell.door) {
    return { ...base, mode: 'point', need: 0, summon: spell.summon?.options[0]?.monster };
  }
  const scaled = scaledSpell(spell, slot, casterLevel);
  if (scaled.targets === 0) return { ...base, mode: 'self', need: 0 };
  return { ...base, mode: 'creatures', need: scaled.beams > 1 ? scaled.beams : scaled.targets };
}

/** Aims one of a creature's spells; a lasting spell that's going is used again with its slot (spiritual weapon). */
export function aimFor(
  sheet: (Pick<Creature, 'caster' | 'effects'> & Partial<Pick<Creature, 'edition'>>) | undefined,
  spellId: string | undefined,
  { slot, free }: { slot: number; free: boolean },
): Aiming | undefined {
  if (!sheet?.caster) return undefined;
  const { caster, effects } = sheet;
  const spell = caster.spells.find((s) => s.id === spellId);
  if (!spell) return undefined;
  const going = effects.find((e) => e.repeat?.spell === spellId)?.repeat;
  if (going)
    return {
      ...aimSpell(spell, going.slot, caster.level),
      repeat: true,
      ...(going.choice && { choice: going.choice }),
    };
  const conjure = spell.attackOnCast ? {} : { mode: 'self' as const, need: 0 };
  return { ...aimSpell(spell, slot, caster.level), ...conjure, ...(free && { free }), ...firstForm(spell, sheet) };
}

/** The form a shape-shifting spell (polymorph) starts on: the first it allows. */
function firstForm(
  spell: Spell,
  { edition, caster }: Partial<Pick<Creature, 'edition' | 'caster'>>,
): Pick<Aiming, 'form'> {
  if (!spell.transform) return {};
  const form = formChoices(spell, gameContent(edition ?? '2014'), caster?.level ?? 1)[0]?.id;
  return form ? { form } : {};
}

/** Aims the spell on a scroll: at the spell's own level, with no slot. */
export function aimScroll(spell: Spell, casterLevel: number): Aiming {
  return { ...aimSpell(spell, spell.level, casterLevel), scroll: true };
}

/** Aims a scroll of `spellId` that `token` reads, at its caster level (or level). */
export function scrollAiming(token: TokenView | undefined, spellId: string | undefined): Aiming | undefined {
  const spell = spellId ? contentFor(token ?? {}).spells.get(spellId) : undefined;
  return spell && aimScroll(spell, readerLevel(token));
}

const readerLevel = (token: TokenView | undefined): number =>
  token?.sheet?.caster?.level ?? characterLevel(token?.stats) ?? 1;

const hasBeams = (spell: Spell): boolean => (spell.beams ?? 1) > 1 || spell.cantrip === 'beams';

/** Adds a creature to the picks; `done` once the spell has all it needs. */
export function pick(aiming: Aiming, id: string): { aiming: Aiming; done: boolean } {
  const picks = !hasBeams(aiming.spell) && aiming.picks.includes(id) ? aiming.picks : [...aiming.picks, id];
  const next = { ...aiming, picks };
  return { aiming: next, done: picks.length >= aiming.need };
}

/** Picks your targets for a spell aimed at creatures (every beam in turn); `done` once it has all it needs. */
export function aimAtTargets(aiming: Aiming, targets: readonly string[]): { aiming: Aiming; done: boolean } {
  if (aiming.mode !== 'creatures' || targets.length === 0) return { aiming, done: false };
  const count = hasBeams(aiming.spell) ? aiming.need : Math.min(aiming.need, targets.length);
  const picks = Array.from({ length: count }, (_, i) => targets[i % targets.length]!);
  return { aiming: { ...aiming, picks }, done: picks.length >= aiming.need };
}

export function castMessage(caster: string, aiming: Aiming, point?: Point): ClientMessage {
  if (aiming.feature) {
    return { t: 'feature', token: caster, feature: aiming.feature, targets: aiming.picks, ...(point && { point }) };
  }
  return {
    t: 'cast',
    caster,
    spell: aiming.spell.id,
    slot: aiming.slot,
    targets: aiming.picks,
    ...(point && { point }),
    ...(aiming.summon && { summon: aiming.summon }),
    ...(aiming.choice && { choice: aiming.choice }),
    ...(aiming.form && { form: aiming.form }),
    ...(aiming.free && { free: true }),
    ...(aiming.repeat && { repeat: true }),
    ...(aiming.scroll && { scroll: true }),
    ...(aiming.item !== undefined && { item: aiming.item }),
  };
}

/** Whether the caster needs a clear line to the aimed point; a cone or line from the caster only takes a direction. */
export function needsClearPath(spell: Spell): boolean {
  return !spell.area || spell.range > 0;
}
