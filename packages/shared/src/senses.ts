import type { Point, Token } from './schema.ts';
import type { Monster } from './stats-schema.ts';
import { feetToPx, type LightSource } from './vision.ts';

// What a creature can perceive: its senses, how much light falls where it
// looks, and whether it notices another creature. The server uses this to
// decide which tokens each player is told about; the client draws the same
// senses as darkvision, blindsight and lit areas on the map.

/** Ranges in feet, plus the power to see invisible things. */
export interface Senses {
  darkvision: number;
  blindsight: number;
  tremorsense: number;
  truesight: number;
  /** Sees normally in magical and nonmagical darkness to this range. */
  devilsSight: number;
  seeInvisible: boolean;
}

export type MonsterSenses = Pick<Monster, 'darkvision' | 'blindsight' | 'tremorsense' | 'truesight'>;

type Range = 'darkvision' | 'blindsight' | 'tremorsense' | 'truesight' | 'devilsSight';

/** The best of what the token, its monster and the effects on it grant. */
export function sensesOf(token: Token, monster?: Partial<MonsterSenses>): Senses {
  const granted = (token.effects ?? []).flatMap((e) => (e.senses ? [e.senses] : []));
  const range = (key: Range) =>
    Math.max(token[key] ?? 0, (key === 'devilsSight' ? 0 : monster?.[key]) ?? 0, ...granted.map((g) => g[key] ?? 0));
  return {
    darkvision: range('darkvision'),
    blindsight: range('blindsight'),
    tremorsense: range('tremorsense'),
    truesight: range('truesight'),
    devilsSight: range('devilsSight'),
    seeInvisible: granted.some((g) => g.seeInvisible === true),
  };
}

export function hasCondition(token: Token, condition: string): boolean {
  return (token.effects ?? []).some((e) => e.conditions?.includes(condition as never));
}

// Light ------------------------------------------------------------------

export type LightLevel = 'bright' | 'dim' | 'dark';

/** World darkness up to this is daylight; up to DIM_UNTIL it is dim (dusk, moonlight). */
const BRIGHT_UNTIL = 0.3;
const DIM_UNTIL = 0.6;

export function ambientLevel(darkness: number): LightLevel {
  if (darkness <= BRIGHT_UNTIL) return 'bright';
  return darkness <= DIM_UNTIL ? 'dim' : 'dark';
}

export interface LightContext {
  darkness: number;
  gridSize: number;
  lights: readonly LightSource[];
  /** Whether nothing blocks sight between two points. */
  clear: (a: Point, b: Point) => boolean;
}

export interface LightHere {
  level: LightLevel;
  /** Inside magical darkness, which only devil's sight and truesight pierce. */
  magical: boolean;
}

const RANK: Record<LightLevel, number> = { dark: 0, dim: 1, bright: 2 };

/** How brightly lit point `p` is. */
export function lightLevelAt(p: Point, ctx: LightContext): LightHere {
  const reaches = (l: LightSource, feet: number) =>
    Math.hypot(l.x - p[0], l.y - p[1]) <= feetToPx(feet, ctx.gridSize) && ctx.clear([l.x, l.y], p);
  if (ctx.lights.some((l) => l.darkness && reaches(l, l.bright + l.dim))) return { level: 'dark', magical: true };
  let level = ambientLevel(ctx.darkness);
  for (const l of ctx.lights) {
    if (l.darkness || level === 'bright') continue;
    if (reaches(l, l.bright)) level = 'bright';
    else if (RANK[level] < RANK.dim && reaches(l, l.bright + l.dim)) level = 'dim';
  }
  return { level, magical: false };
}

// Perception -------------------------------------------------------------

export interface Eyes {
  at: Point;
  senses: Senses;
  blinded: boolean;
}

export interface Seen {
  at: Point;
  invisible: boolean;
}

/** Whether a creature with `eyes` notices a creature at `target`. */
export function perceives(eyes: Eyes, target: Seen, ctx: LightContext): boolean {
  const distance = Math.hypot(eyes.at[0] - target.at[0], eyes.at[1] - target.at[1]);
  const within = (feet: number) => feet > 0 && distance <= feetToPx(feet, ctx.gridSize);
  const s = eyes.senses;
  if (within(s.tremorsense)) return true;
  if (!ctx.clear(eyes.at, target.at)) return false;
  if (within(s.blindsight)) return true;
  if (eyes.blinded) return false;
  if (within(s.truesight)) return true;
  if (target.invisible && !s.seeInvisible) return false;
  const light = lightLevelAt(target.at, ctx);
  if (light.magical) return within(s.devilsSight);
  return light.level !== 'dark' || within(s.darkvision) || within(s.devilsSight);
}
