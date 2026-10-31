import { scaledSpell, type ClientMessage, type Point, type Spell } from '@vtt/shared';

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
  /** Cast without spending a slot. */
  free?: boolean;
  /** Set when a feature is aimed like a spell (bardic inspiration): it's used instead of cast. */
  feature?: string;
}

export function aimSpell(spell: Spell, slot: number, casterLevel: number): Aiming {
  const base = { spell, slot, picks: [] };
  if (spell.area || spell.teleport || spell.summon) {
    return { ...base, mode: 'point', need: 0, summon: spell.summon?.options[0]?.monster };
  }
  const scaled = scaledSpell(spell, slot, casterLevel);
  if (scaled.targets === 0) return { ...base, mode: 'self', need: 0 };
  return { ...base, mode: 'creatures', need: scaled.beams > 1 ? scaled.beams : scaled.targets };
}

/** Adds a creature to the picks; `done` once the spell has all it needs. */
export function pick(aiming: Aiming, id: string): { aiming: Aiming; done: boolean } {
  const beams = (aiming.spell.beams ?? 1) > 1 || aiming.spell.cantrip === 'beams';
  const picks = !beams && aiming.picks.includes(id) ? aiming.picks : [...aiming.picks, id];
  const next = { ...aiming, picks };
  return { aiming: next, done: picks.length >= aiming.need };
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
    ...(aiming.free && { free: true }),
  };
}

/** Whether the caster needs a clear line to the aimed point; a cone or line from the caster only takes a direction. */
export function needsClearPath(spell: Spell): boolean {
  return !spell.area || spell.range > 0;
}
