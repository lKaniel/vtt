import type { Point } from '@vtt/shared';
import { Graphics, Text, type Container } from 'pixi.js';
import type { Tone } from '../feedback.ts';

// Effects drawn with code, no image files: each one owns a display object and
// redraws itself from the time since it started until it's done.

export interface Fx {
  readonly view: Container;
  /** Draws the effect `ms` after it started; false once it's over. */
  update(ms: number): boolean;
}

interface Mote {
  angle: number;
  speed: number;
  size: number;
  /** Where along the way it starts, 0 to 1. */
  delay: number;
}

const motes = (n: number, spread = Math.PI * 2, around = 0): Mote[] =>
  Array.from({ length: n }, () => ({
    angle: around + (Math.random() - 0.5) * spread,
    speed: 0.55 + Math.random() * 0.45,
    size: 0.6 + Math.random() * 0.8,
    delay: Math.random() * 0.35,
  }));

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** A glowing graphics layer: drawn with additive blending so colours light up the map. */
function glow(): Graphics {
  const g = new Graphics();
  g.blendMode = 'add';
  return g;
}

/** A soft dot: a few stacked circles, faint and wide to bright and small. */
function dot(g: Graphics, [x, y]: Point, r: number, { color, alpha }: { color: number; alpha: number }): void {
  g.circle(x, y, r * 2.2).fill({ color, alpha: alpha * 0.15 });
  g.circle(x, y, r * 1.3).fill({ color, alpha: alpha * 0.35 });
  g.circle(x, y, r * 0.6).fill({ color: 0xffffff, alpha: alpha * 0.9 });
}

/** A crescent sweep across the target, swung from the attacker's side. */
export function slash(from: Point, to: Point, r: number, color: number): Fx {
  // Normal blending: on a light floor an additive white arc disappears.
  const g = new Graphics();
  const facing = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const DURATION = 380;
  return {
    view: g,
    update(ms) {
      const t = ms / DURATION;
      g.clear();
      if (t >= 1) return false;
      const sweep = easeOut(clamp01(t * 1.8));
      const fade = 1 - clamp01((t - 0.4) / 0.6);
      const start = facing - 1.4;
      const end = start + 2.8 * sweep;
      const R = r * 1.25;
      const cx = to[0] - Math.cos(facing) * r * 0.45;
      const cy = to[1] - Math.sin(facing) * r * 0.45;
      for (const [w, c, a] of [
        [r * 0.42, 0x000000, 0.25],
        [r * 0.3, color, 0.55],
        [r * 0.12, 0xffffff, 1],
      ] as const) {
        g.arc(cx, cy, R, Math.max(start, end - 1.8), end);
        g.stroke({ width: w, color: c, alpha: a * fade, cap: 'round' });
      }
      return true;
    },
  };
}

/** An arrow streak or a glowing orb flying from one point to another; lightning is a jagged bolt. */
export function missile(
  from: Point,
  to: Point,
  { color, style, duration, jagged }: { color: number; style: 'arrow' | 'orb'; duration: number; jagged: boolean },
): Fx {
  const g = glow();
  let draw = style === 'arrow' ? drawArrow : drawOrb;
  if (jagged) draw = drawBolt;
  return {
    view: g,
    update(ms) {
      g.clear();
      const t = ms / duration;
      if (t >= 1) return false;
      draw(g, [from, to], t, color);
      return true;
    },
  };
}

function drawArrow(g: Graphics, [from, to]: [Point, Point], t: number, color: number): void {
  const head = lerp(from, to, t);
  const tail = lerp(from, to, Math.max(0, t - 0.18));
  g.moveTo(...tail)
    .lineTo(...head)
    .stroke({ width: 6, color, alpha: 0.25, cap: 'round' });
  g.moveTo(...tail)
    .lineTo(...head)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.9, cap: 'round' });
}

function drawOrb(g: Graphics, [from, to]: [Point, Point], t: number, color: number): void {
  const e = easeIn(t);
  for (let i = 8; i >= 0; i--) {
    const back = Math.max(0, e - i * 0.04);
    dot(g, lerp(from, to, back), 15 * (1 - i / 9), { color, alpha: 1 - i / 8 });
  }
}

const easeIn = (t: number) => t * t * 0.4 + t * 0.6;

/** A forked line that flickers; it stays drawn the whole way, like a real strike. */
function drawBolt(g: Graphics, [from, to]: [Point, Point], t: number, color: number): void {
  const reach = clamp01(t * 3);
  const end = lerp(from, to, reach);
  const steps = 9;
  const len = Math.hypot(end[0] - from[0], end[1] - from[1]);
  const nx = -(end[1] - from[1]) / (len || 1);
  const ny = (end[0] - from[0]) / (len || 1);
  const points: Point[] = [from];
  for (let i = 1; i < steps; i++) {
    const [x, y] = lerp(from, end, i / steps);
    const off = (Math.random() - 0.5) * Math.min(40, len * 0.12);
    points.push([x + nx * off, y + ny * off]);
  }
  points.push(end);
  const fade = 1 - clamp01((t - 0.6) / 0.4);
  for (const [width, c, alpha] of [
    [10, color, 0.3],
    [2.5, 0xffffff, 1],
  ] as const) {
    g.poly(points.flat(), false).stroke({ width, color: c, alpha: alpha * fade });
  }
}

/** A flash and ring that spread to `radius`, throwing sparks outward. */
export function burst(at: Point, radius: number, color: number): Fx {
  const g = glow();
  const sparks = motes(Math.min(60, 16 + radius / 8));
  const DURATION = 620;
  return {
    view: g,
    update(ms) {
      g.clear();
      const t = ms / DURATION;
      if (t >= 1) return false;
      const grow = easeOut(clamp01(t * 2.2));
      const fade = 1 - clamp01((t - 0.25) / 0.75);
      g.circle(at[0], at[1], radius * grow).fill({ color, alpha: 0.2 * fade });
      g.circle(at[0], at[1], radius * grow * 0.45).fill({ color: 0xffffff, alpha: 0.2 * fade * (1 - t) });
      g.circle(at[0], at[1], radius * grow).stroke({ width: 6, color, alpha: 0.8 * fade });
      for (const m of sparks) {
        const d = radius * m.speed * easeOut(clamp01(t * 1.4));
        dot(g, [at[0] + Math.cos(m.angle) * d, at[1] + Math.sin(m.angle) * d], 4 * m.size, { color, alpha: fade });
      }
      return true;
    },
  };
}

/** A cone or line of sparks streaming from the caster toward a point. */
export function spray(
  from: Point,
  toward: Point,
  length: number,
  { color, wide }: { color: number; wide: boolean },
): Fx {
  const g = glow();
  const facing = Math.atan2(toward[1] - from[1], toward[0] - from[0]);
  const sparks = motes(70, wide ? 1.0 : 0.12, facing);
  const DURATION = 700;
  return {
    view: g,
    update(ms) {
      g.clear();
      const t = ms / DURATION;
      if (t >= 1) return false;
      for (const m of sparks) {
        const local = clamp01((t - m.delay) / 0.6);
        if (local <= 0 || local >= 1) continue;
        const d = length * m.speed * easeOut(local);
        dot(g, [from[0] + Math.cos(m.angle) * d, from[1] + Math.sin(m.angle) * d], 5 * m.size, {
          color,
          alpha: 1 - local,
        });
      }
      return true;
    },
  };
}

/** A circle of light gathering under the caster, with motes spinning inward. */
export function channel(at: Point, r: number, color: number): Fx {
  const g = glow();
  const DURATION = 520;
  const n = 6;
  return {
    view: g,
    update(ms) {
      g.clear();
      const t = ms / DURATION;
      if (t >= 1) return false;
      const fade = Math.sin(Math.PI * t);
      g.circle(at[0], at[1], r * 1.35).stroke({ width: 3, color, alpha: 0.7 * fade });
      g.circle(at[0], at[1], r * (1.6 - t * 0.5)).stroke({ width: 1.5, color, alpha: 0.5 * fade });
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t * 5;
        const d = r * (1.6 - t * 0.9);
        dot(g, [at[0] + Math.cos(a) * d, at[1] + Math.sin(a) * d], 4, { color, alpha: fade });
      }
      return true;
    },
  };
}

/** Sparkles rising around a creature: healing and blessings. */
export function rise(at: Point, r: number, color: number): Fx {
  const g = glow();
  const sparks = motes(22);
  const DURATION = 900;
  return {
    view: g,
    update(ms) {
      g.clear();
      const t = ms / DURATION;
      if (t >= 1) return false;
      g.circle(at[0], at[1], r * 1.1).fill({ color, alpha: 0.18 * Math.sin(Math.PI * t) });
      for (const m of sparks) {
        const local = clamp01((t - m.delay) / 0.65);
        if (local <= 0 || local >= 1) continue;
        const x = at[0] + Math.cos(m.angle) * r * 0.9 * m.speed;
        const y = at[1] + r * 0.5 - local * r * 1.8 * m.speed;
        dot(g, [x, y], 3 * m.size, { color, alpha: Math.sin(Math.PI * local) });
      }
      return true;
    },
  };
}

const TONES: Record<Tone, { fill: number; size: number; stroke: number }> = {
  damage: { fill: 0xfff1d6, size: 56, stroke: 0x6a1208 },
  crit: { fill: 0xffc94a, size: 76, stroke: 0x6a2400 },
  heal: { fill: 0x9cf5aa, size: 56, stroke: 0x0d3a16 },
  miss: { fill: 0xd8d0c0, size: 40, stroke: 0x1a1a1a },
  note: { fill: 0xd9c8ff, size: 36, stroke: 0x241640 },
};

/** A number that pops up over a creature, drifts up and fades. */
export function floatingText(at: Point, text: string, tone: Tone, scale: number): Fx {
  const style = TONES[tone];
  const label = new Text({
    text: tone === 'crit' ? `${text}!` : text,
    style: {
      fill: style.fill,
      fontFamily: '"IM Fell English SC", Georgia, serif',
      fontSize: style.size * scale,
      stroke: { color: style.stroke, width: 6 * scale },
      dropShadow: { color: 0x000000, alpha: 0.6, blur: 4, distance: 2 },
    },
  });
  label.anchor.set(0.5, 1);
  const DURATION = tone === 'crit' ? 1500 : 1150;
  const drift = (Math.random() - 0.5) * 30 * scale;
  return {
    view: label,
    update(ms) {
      const t = ms / DURATION;
      if (t >= 1) return false;
      const pop = t < 0.08 ? 0.8 + (t / 0.08) * 0.5 : 1.3 - clamp01((t - 0.08) / 0.15) * 0.3;
      label.scale.set(pop);
      label.position.set(at[0] + drift * t, at[1] - 70 * scale * easeOut(t));
      label.alpha = 1 - clamp01((t - 0.65) / 0.35);
      return true;
    },
  };
}
