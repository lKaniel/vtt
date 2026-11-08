import type { Rng } from '@vtt/shared';
import type { Creature } from './creature.ts';
import { rollSpellSave } from './effects.ts';
import { weightOf } from './pools.ts';
import { type Effect, EffectTemplateSchema, type Spell } from './spell-schema.ts';
import type { CastResult, CastSide } from './spells.ts';
import type { Token } from './token-schema.ts';

// What pool features add to casting (power-schema.ts): creatures a use can't
// touch (mindless ones, heavy minds) and the save a crowd makes when one use
// hurts many at once (Phantasmal Barrage).

/** A creature's weight as the caster's pool counts it; 0 without a weight. */
export function weightFor(caster: Pick<Creature, 'pool'>, target: Pick<Creature, 'rank' | 'abilities'>): number {
  const def = caster.pool?.weight;
  return def ? weightOf(def, target.rank ?? 0, target.abilities) : 0;
}

/** The spell can't affect the target: the wrong kind of creature, too little mind (`minInt`) or too heavy one (`maxWeight`). */
export function powerImmune(spell: Spell, caster: Creature, target: Creature): boolean {
  if (spell.creatureTypes && !spell.creatureTypes.includes(target.type)) return true;
  if (spell.minInt !== undefined && target.abilities.int < spell.minInt) return true;
  return spell.maxWeight !== undefined && weightFor(caster, target) > spell.maxWeight;
}

interface Crowd {
  spell: Spell;
  caster: CastSide;
  targets: readonly CastSide[];
  dc: number;
  rng: Rng;
}

/** When the use damaged enough creatures, each makes the crowd save or gets its effect too. */
export function withCrowd(results: CastResult[], { spell, caster, targets, dc, rng }: Crowd): CastResult[] {
  const crowd = spell.crowd;
  if (!crowd) return results;
  const hurt = new Set(results.filter((r) => r.damage > 0).map((r) => r.target));
  if (hurt.size < crowd.atLeast) return results;
  const template = EffectTemplateSchema.parse(crowd.effect);
  return results.map((r) => {
    const target = targets.find((t) => t.token.id === r.target);
    if (!target || !hurt.has(r.target) || r.hp <= 0) return r;
    const save = rollSpellSave(target.sheet, { ability: crowd.ability, dc, vs: template.conditions ?? [] }, rng);
    if (save.success) return { ...r, crowdSave: save };
    const effect: Effect = {
      ...template,
      id: `${spell.id}-crowd-${caster.token.id}`,
      name: template.name ?? spell.name,
      source: caster.token.id,
    };
    return { ...r, crowdSave: save, effects: [...(r.effects ?? []), effect] };
  });
}

/** Whether a creature is linked to `caster`: under one of its effects that opens a channel (a Weave). */
export function isLinked(token: Pick<Token, 'effects'>, caster: string): boolean {
  return !!token.effects?.some((e) => e.linked && e.source === caster);
}

/** A token without the effects that keep these holds going. */
export function withoutHeld<T extends Pick<Token, 'effects'>>(token: T, holds: ReadonlySet<string>): T {
  const effects = token.effects?.filter((e) => e.hold === undefined || !holds.has(e.hold));
  if (effects?.length === token.effects?.length) return token;
  return { ...token, effects: effects?.length ? effects : undefined };
}

/** The holds of `token` no effect on any of `tokens` keeps going any more (their Weave ended). */
export function endedHolds(token: Pick<Token, 'holds' | 'id'>, tokens: readonly Pick<Token, 'effects'>[]): string[] {
  const live = new Set(tokens.flatMap((t) => (t.effects ?? []).flatMap((e) => (e.hold ? [e.hold] : []))));
  return (token.holds ?? []).filter((h) => !live.has(h.id)).map((h) => h.id);
}
