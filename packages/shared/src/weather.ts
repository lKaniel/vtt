import { z } from 'zod';

// Weather over a scene, like Foundry's weather effects and FXMaster: layers
// of particles (rain, snow, clouds, fog, embers, birds) drifting across the
// screen. The motion is here so it can be tested; the client draws it
// (canvas/WeatherLayer.ts).

export const WEATHER_KINDS = ['rain', 'snow', 'clouds', 'fog', 'embers', 'birds'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

export const WeatherSchema = z.object({
  kind: z.enum(WEATHER_KINDS),
  /** How thick it is, 0 to 1. */
  density: z.number().min(0).max(1).default(0.5),
  /** Sideways push, -1 (to the left) to 1 (to the right). */
  wind: z.number().min(-1).max(1).optional(),
  /** A colour for the particles instead of the kind's own. */
  tint: z.string().optional(),
});
export type Weather = z.infer<typeof WeatherSchema>;

/** One drop, flake, puff or bird, in screen pixels. */
export interface Particle {
  x: number;
  y: number;
  /** Pixels a second. */
  vx: number;
  vy: number;
  /** Radius (or length, for rain) in pixels. */
  size: number;
  alpha: number;
  /** A phase for wobbling and flapping, in radians. */
  phase: number;
}

interface Motion {
  /** Particles per million screen pixels at full density. */
  perMegapixel: number;
  /** Speed down the screen (negative: up), in pixels a second, from and to. */
  fall: [number, number];
  /** Drift sideways with no wind. */
  drift: [number, number];
  size: [number, number];
  alpha: [number, number];
  /** Pixels a second the wind adds at full strength. */
  wind: number;
  /** Sideways wobble in pixels a second. */
  wobble: number;
}

const MOTION: Record<WeatherKind, Motion> = {
  rain: {
    perMegapixel: 600,
    fall: [700, 1000],
    drift: [0, 0],
    size: [10, 22],
    alpha: [0.25, 0.5],
    wind: 300,
    wobble: 0,
  },
  snow: {
    perMegapixel: 300,
    fall: [40, 90],
    drift: [-10, 10],
    size: [1.5, 4],
    alpha: [0.5, 0.9],
    wind: 80,
    wobble: 20,
  },
  clouds: {
    perMegapixel: 6,
    fall: [4, 10],
    drift: [12, 25],
    size: [140, 260],
    alpha: [0.25, 0.4],
    wind: 30,
    wobble: 0,
  },
  fog: { perMegapixel: 14, fall: [-3, 3], drift: [6, 14], size: [120, 220], alpha: [0.08, 0.16], wind: 20, wobble: 4 },
  embers: {
    perMegapixel: 90,
    fall: [-70, -30],
    drift: [-15, 15],
    size: [1, 2.5],
    alpha: [0.6, 1],
    wind: 40,
    wobble: 25,
  },
  birds: { perMegapixel: 4, fall: [-20, 20], drift: [60, 110], size: [9, 14], alpha: [0.7, 0.9], wind: 40, wobble: 0 },
};

const between = ([a, b]: [number, number], rng: () => number) => a + (b - a) * rng();

/** How many particles a layer has on a screen this big. */
export function particleCount(weather: Weather, w: number, h: number): number {
  return Math.round(MOTION[weather.kind].perMegapixel * weather.density * ((w * h) / 1_000_000));
}

/** A new particle somewhere on the screen. */
export function spawnParticle(weather: Weather, w: number, h: number, rng: () => number): Particle {
  const m = MOTION[weather.kind];
  return {
    x: rng() * w,
    y: rng() * h,
    vx: between(m.drift, rng),
    vy: between(m.fall, rng),
    size: between(m.size, rng),
    alpha: between(m.alpha, rng),
    phase: rng() * Math.PI * 2,
  };
}

interface Screen {
  w: number;
  h: number;
}

/** Wraps a coordinate that left [−margin, size + margin] back in at the other side. */
function wrap(v: number, size: number, margin: number): number {
  const span = size + 2 * margin;
  return ((((v + margin) % span) + span) % span) - margin;
}

/** The particle `dt` seconds later; one that leaves the screen comes back in on the other side. */
export function stepParticle(p: Particle, weather: Weather, dt: number, { w, h }: Screen): Particle {
  const m = MOTION[weather.kind];
  const phase = p.phase + dt * 2;
  const x = p.x + (p.vx + (weather.wind ?? 0) * m.wind + Math.sin(phase) * m.wobble) * dt;
  const y = p.y + p.vy * dt;
  const margin = p.size;
  return { ...p, x: wrap(x, w, margin), y: wrap(y, h, margin), phase };
}
