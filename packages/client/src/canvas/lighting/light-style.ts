import type { Light } from '@vtt/shared';

// How lights look: their colour, how their brightness falls off with
// distance, and how torches flicker. Pure functions so they can be tested
// without a GPU.

/** A torch-like warm white for lights that don't name a colour. */
const WARM_WHITE = 0xfff0d8;
/** The colour the world takes on at full darkness, before it is dimmed. */
const MOONLIGHT = 0x5a6aa8;

export function parseColor(css: string | undefined, fallback: number): number {
  const m = css && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css.trim());
  if (!m) return fallback;
  const hex = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!;
  return parseInt(hex, 16);
}

export function lightColor(light: Pick<Light, 'color'>): number {
  return parseColor(light.color, WARM_WHITE);
}

function scale(color: number, k: number): number {
  const ch = (s: number) => Math.min(255, Math.round(((color >> s) & 255) * k)) << s;
  return ch(16) | ch(8) | ch(0);
}

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
}

/** The light everything gets without a lamp: daylight, dusk, or a faint blue night. */
export function ambientColor(darkness: number): number {
  const d = Math.min(1, Math.max(0, darkness));
  return scale(mix(0xffffff, MOONLIGHT, Math.min(1, d * 1.3)), 1 - d * 0.88);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1)));
  return t * t * (3 - 2 * t);
}

/**
 * Brightness at `r` (0 at the light, 1 at the edge of its dim light) for a
 * light whose bright part reaches `bright` of the way out. Bright light is
 * full strength, dim light is half, and the edges blend instead of stepping.
 */
export function falloff(r: number, bright: number): number {
  if (r >= 1) return 0;
  const dim = 0.5 * (1 - smoothstep(bright, 1, r));
  if (bright <= 0) return dim;
  return dim + 0.5 * (1 - smoothstep(bright * 0.5, Math.min(1, bright * 1.2), r));
}

/** Strength of an animated light at time `ms`; `seed` keeps neighbouring torches out of step. */
export function lightPulse(animation: Light['animation'], ms: number, seed: number): number {
  const t = ms / 1000 + seed * 7.31;
  if (animation === 'pulse') return 1 + 0.12 * Math.sin(t * 2.2);
  if (animation === 'flicker')
    return 0.94 + 0.05 * Math.sin(t * 9.7) + 0.035 * Math.sin(t * 23.3 + 1.7) + 0.025 * Math.sin(t * 41.9);
  return 1;
}
