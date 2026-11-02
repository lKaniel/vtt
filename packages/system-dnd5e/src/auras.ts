import { isParty } from '@vtt/shared';
import { tokenDistance } from './attack.ts';
import type { Creature } from './creature.ts';
import { ownEffects } from './creature.ts';
import { abilityMod } from './creature-math.ts';
import { ABILITY_VALUE } from './effect-changes.ts';
import type { Aura, Effect } from './spell-schema.ts';
import type { Abilities, Ability } from './stats-schema.ts';
import type { Token } from './token-schema.ts';

// Auras, like Active Auras: an effect with `aura` on a creature (a paladin's
// Aura of Protection, a spell, one the GM wrote) lands on the creatures within
// its radius as a copy marked `auraFrom`, and comes off when they leave. The
// server keeps the copies in step after every change (aura-keeper.ts), so
// the rest of the rules see them as plain effects.

export interface AuraBearer {
  token: Token;
  sheet: Creature;
}

/** A change value for this bearer: "@cha" is its Charisma modifier, "max(1,@cha)" at least 1; anything else as it is. */
export function resolveValue(value: number | string, abilities: Abilities): number | string {
  const m = typeof value === 'string' ? ABILITY_VALUE.exec(value) : null;
  const mod = m ? abilityMod(abilities[m[2] as Ability]) : 0;
  const floor = m?.[1] === undefined ? Number.NEGATIVE_INFINITY : Number(m[1]);
  return m ? Math.max(floor, mod) : value;
}

/** The effects that give off an aura on this creature: its own, and its features' always-on ones. */
function emitters({ token, sheet }: AuraBearer): (Effect & { aura: Aura })[] {
  const awake = sheet.hp > 0 && !sheet.conditions.includes('unconscious');
  return ownEffects(token, sheet.features).filter(
    (e): e is Effect & { aura: Aura } => !!e.aura && (awake || e.aura.conscious === false),
  );
}

function touches(aura: Aura, bearer: Token, other: Token): boolean {
  if (other.id === bearer.id) return aura.self ?? aura.who !== 'enemies';
  if (aura.who === 'all') return true;
  return (isParty(other) === isParty(bearer)) === (aura.who === 'allies');
}

/** The copy of an aura effect a creature in it gets. */
function copyOf(effect: Effect & { aura: Aura }, bearer: AuraBearer): Effect {
  const { aura: _aura, rounds: _rounds, endsAt: _endsAt, ...rest } = effect;
  const changes = rest.changes?.map((c) => ({ ...c, value: resolveValue(c.value, bearer.sheet.abilities) }));
  return {
    ...rest,
    id: `aura-${bearer.token.id}-${effect.id}`,
    source: bearer.token.id,
    auraFrom: `${bearer.token.id}:${effect.id}`,
    ...(changes && { changes }),
  };
}

/** The creatures one of a bearer's aura effects reaches. */
function reached(
  bearer: AuraBearer,
  effect: Effect & { aura: Aura },
  all: readonly AuraBearer[],
  ground: Ground,
): Token[] {
  return all
    .map((b) => b.token)
    .filter((t) => {
      const near =
        t.id === bearer.token.id ||
        tokenDistance(bearer.token, t, ground.gridSize, ground.gridless) <= effect.aura.radius;
      return near && touches(effect.aura, bearer.token, t);
    });
}

interface Ground {
  gridSize: number;
  gridless?: boolean;
}

/** Every aura copy each creature on the scene should have now, by token id. */
export function auraEffects(bearers: readonly AuraBearer[], ground: Ground): Map<string, Effect[]> {
  const out = new Map<string, Effect[]>();
  for (const bearer of bearers) {
    for (const effect of emitters(bearer)) {
      const copy = copyOf(effect, bearer);
      for (const t of reached(bearer, effect, bearers, ground)) out.set(t.id, [...(out.get(t.id) ?? []), copy]);
    }
  }
  return out;
}

/** The token with exactly these aura copies; undefined when it has them already. */
export function withAuras(token: Token, auras: readonly Effect[]): Token | undefined {
  const own = (token.effects ?? []).filter((e) => !e.auraFrom);
  const had = (token.effects ?? []).filter((e) => e.auraFrom);
  if (JSON.stringify(had) === JSON.stringify(auras)) return undefined;
  return { ...token, effects: [...own, ...auras] };
}
