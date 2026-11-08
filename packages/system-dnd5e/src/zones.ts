import { type AreaShape, areaShape, inArea } from './areas.ts';
import { isParty, type Light, type Point, ringAround, wallAcross, type WallRules } from '@vtt/shared';
import type { Token } from './token-schema.ts';
import type { Area } from './area-schema.ts';
import type { Effect, Spell } from './spell-schema.ts';

// Spells that last: areas that keep hurting creatures in them (spirit
// guardians, moonbeam) and spells the caster can use again on later turns
// (spiritual weapon, call lightning). Both live as effects on the caster, so
// they count down and end with concentration like any other effect.

/** The effects a lasting spell leaves on its caster when cast with `slot`. */
export function lastingEffects(caster: Token, spell: Spell, slot: number, point?: Point): Effect[] {
  const base = {
    source: caster.id,
    spell: spell.id,
    slot,
    rounds: spell.rounds,
    concentration: spell.concentration || undefined,
  };
  const out: Effect[] = [];
  if (spell.zone && spell.area) out.push(zoneOf(caster, spell, { slot, point, base }));
  if (spell.field && spell.area) out.push(fieldOf(caster, spell, { slot, point, base }));
  if (spell.repeat && spell.repeatBy !== 'target') {
    out.push({
      ...base,
      id: `${spell.id}-repeat-${caster.id}`,
      name: spell.name,
      repeat: { spell: spell.id, slot, ...(spell.chosen && { choice: spell.chosen }) },
    });
  }
  return out;
}

/** The zone a lasting area keeps on its caster: where it is and whom it spares. */
function zoneOf(
  caster: Token,
  spell: Spell,
  { slot, point, base }: { slot: number; point?: Point; base: Partial<Effect> },
): Effect {
  const at = spell.range > 0 ? point : undefined;
  const zone = {
    spell: spell.id,
    slot,
    ...(at && { at }),
    ...(spell.zone!.spares && { spares: spell.zone!.spares }),
    ...(spell.chosen && { choice: spell.chosen }),
  };
  return { ...base, id: `${spell.id}-zone-${caster.id}`, name: spell.name, zone };
}

/** The aura a lasting area keeps while it lasts: what creatures inside it get, around the caster or at the point. */
function fieldOf(
  caster: Token,
  spell: Spell,
  { slot, point, base }: { slot: number; point?: Point; base: Partial<Effect> },
): Effect {
  const { aura, ...field } = spell.field!;
  const at = spell.range > 0 ? point : undefined;
  const ward =
    field.spellWard === undefined
      ? {}
      : { spellWard: field.spellWard + Math.max(0, slot - spell.level) * (spell.upcast?.ward ?? 0) };
  return {
    ...base,
    ...field,
    ...ward,
    id: `${spell.id}-field-${caster.id}`,
    name: field.name ?? spell.name,
    aura: { radius: spell.area!.size, who: aura?.who ?? 'all', self: aura?.self, conscious: false, ...(at && { at }) },
  };
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

/** Where a zone's template goes on the map (see templates.ts in shared): its shape, origin and reach in feet. */
export interface ZoneTemplate {
  shape: 'circle' | 'cone' | 'line' | 'square';
  x: number;
  y: number;
  distance: number;
  direction?: number;
  width?: number;
  /** Set when it surrounds or starts at its caster, and so moves with them. */
  attachedTo?: string;
}

const SHAPES = { sphere: 'circle', emanation: 'circle', cone: 'cone', line: 'line', cube: 'square' } as const;

/** A cone or line aimed at a point starts at its caster: the direction it points, in degrees. */
function aimedFrom(bearer: Token, shape: string, at: Point | undefined): number | undefined {
  if (!at || (shape !== 'cone' && shape !== 'line')) return undefined;
  return Math.round((Math.atan2(at[1] - bearer.y, at[0] - bearer.x) * 180) / Math.PI);
}

/** The template a zone shows as: where it was aimed, or on its caster. */
export function zoneTemplate({ bearer, effect }: ZoneHit, spell: Spell): ZoneTemplate | undefined {
  const area = spell.area;
  if (!area) return undefined;
  const at = effect.zone.at;
  const direction = aimedFrom(bearer, area.shape, at);
  const onCaster = !at || area.shape === 'emanation' || direction !== undefined;
  const [x, y] = onCaster ? [bearer.x, bearer.y] : at;
  const reach = area.shape === 'emanation' ? area.size + (bearer.size * 5) / 2 : area.size;
  return {
    shape: SHAPES[area.shape],
    x,
    y,
    distance: reach,
    ...(direction !== undefined && { direction }),
    ...(area.shape === 'line' && { width: area.width }),
    ...(onCaster && { attachedTo: bearer.id }),
  };
}

/** Every zone some creature keeps going. */
export function zonesOf(tokens: Iterable<Token>): ZoneHit[] {
  const out: ZoneHit[] = [];
  for (const bearer of tokens) {
    for (const e of bearer.effects ?? []) if (e.zone) out.push({ bearer, effect: { ...e, zone: e.zone } });
  }
  return out;
}

/** What a lasting area puts on the map: a light, walls with the rules they all share, and difficult ground. */
export interface ZonePlacements {
  light?: Light & { x: number; y: number };
  walls: { a: Point; b: Point }[];
  rules?: WallRules;
  region?: { name: string; points: Point[]; behaviors: { type: 'difficult'; multiplier: number }[]; visible: true };
}

/** The light, walls and ground a zone's spell puts on the map (see Spell `places`), in pixels at `gridSize` per 5 ft. */
export function zonePlacements({ bearer, effect }: ZoneHit, spell: Spell, gridSize: number): ZonePlacements {
  const places = spell.places;
  const size = spell.area?.size;
  if (!places || size === undefined) return { walls: [] };
  const at: Point = effect.zone.at ?? [bearer.x, bearer.y];
  const light = places.light && { dim: 0, ...places.light, bright: size, x: at[0], y: at[1] };
  const region = places.ground && {
    name: spell.name,
    points: outline(areaShape(spell as Spell & { area: Area }, { caster: bearer, aim: at, gridSize })),
    behaviors: [{ type: 'difficult' as const, multiplier: places.ground.multiplier }],
    visible: true as const,
  };
  if (!places.wall) return { light, walls: [], ...(region && { region }) };
  const { shape, ...rules } = places.wall;
  const px = (size * gridSize) / 5;
  const ends = shape === 'ring' ? ringAround(at, px) : [wallAcross([bearer.x, bearer.y], at, px)];
  return { light, walls: ends.map(([a, b]) => ({ a, b })), rules, ...(region && { region }) };
}

/** An area's outline as points: a circle as 24 of them. */
function outline(shape: AreaShape): Point[] {
  if (shape.kind === 'polygon') return shape.points;
  const [x, y] = shape.center;
  return Array.from({ length: 24 }, (_, i): Point => {
    const a = (i / 24) * 2 * Math.PI;
    return [Math.round(x + shape.radius * Math.cos(a)), Math.round(y + shape.radius * Math.sin(a))];
  });
}
