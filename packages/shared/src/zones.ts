import { inArea } from './areas.ts';
import { isParty } from './permissions.ts';
import type { Point, Token } from './schema.ts';
import type { Effect, Spell } from './spell-schema.ts';

// Spells that last: areas that keep hurting creatures in them (spirit
// guardians, moonbeam) and spells the caster can use again on later turns
// (spiritual weapon, call lightning). Both live as effects on the caster, so
// they count down and end with concentration like any other effect.

/** The effects a lasting spell leaves on its caster when cast with `slot`. */
export function lastingEffects(caster: Token, spell: Spell, slot: number, point?: Point): Effect[] {
  const base = {
    source: caster.id,
    rounds: spell.rounds,
    concentration: spell.concentration || undefined,
  };
  const out: Effect[] = [];
  if (spell.zone && spell.area) {
    const at = spell.range > 0 ? point : undefined;
    const zone = { spell: spell.id, slot, ...(at && { at }), ...(spell.zone.spares && { spares: spell.zone.spares }) };
    out.push({ ...base, id: `${spell.id}-zone-${caster.id}`, name: spell.name, zone });
  }
  if (spell.repeat) {
    out.push({ ...base, id: `${spell.id}-repeat-${caster.id}`, name: spell.name, repeat: { spell: spell.id, slot } });
  }
  return out;
}

export interface ZoneHit {
  bearer: Token;
  effect: Effect & { zone: NonNullable<Effect['zone']> };
}

const onSide = (t: Pick<Token, 'ownership'>) => isParty(t);

/** Whether a creature standing at `at` is in the zone, and not one it spares. */
export function inZone(
  { bearer, effect }: ZoneHit,
  spell: Spell,
  { token, at, gridSize }: { token: Token; at: Point; gridSize: number },
): boolean {
  if (token.id === bearer.id) return false;
  if (effect.zone.spares === 'allies' && onSide(token) === onSide(bearer)) return false;
  const aim = effect.zone.at ?? [bearer.x, bearer.y];
  return inArea(
    { area: spell.area!, range: spell.range },
    { caster: bearer, aim, gridSize, token: { ...token, x: at[0], y: at[1] } },
  );
}

/** Every zone some creature keeps going. */
export function zonesOf(tokens: Iterable<Token>): ZoneHit[] {
  const out: ZoneHit[] = [];
  for (const bearer of tokens) {
    for (const e of bearer.effects ?? []) if (e.zone) out.push({ bearer, effect: { ...e, zone: e.zone } });
  }
  return out;
}
