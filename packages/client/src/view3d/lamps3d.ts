import { type Light, lightShines, onLevels, type PlacedLight, type Point } from '@vtt/shared';
import * as THREE from 'three';

// The scene's lights in 3D: the torches, braziers and glowing crystals the
// flat map lights its ground with also light the models round them, and a
// creature carrying a light lights its way. Every light costs every lit
// pixel, so only the few nearest the camera shine, from a fixed pool (a
// pool that changes size makes three.js build its shaders again).

/** A light as the 3D view stands it: where (map x, y and height, pixels), its colour, how far it reaches and how. */
export interface Lamp {
  key: string;
  at: [number, number, number];
  color: number;
  /** Pixels: as far as its dim light. */
  reach: number;
  strength: number;
  animation?: 'flicker' | 'pulse';
}

/** A creature carrying a light, where it stands. */
export interface Carried {
  id: string;
  light: Light;
  at: Point;
  /** Its feet's height and its size, pixels. */
  feet: number;
  size: number;
}

export interface LampInput {
  placed: readonly PlacedLight[];
  carried: readonly Carried[];
  darkness: number;
  /** Pixels per foot. */
  px: number;
  /** The ground's height at a map point, pixels. */
  groundAt(p: Point): number;
  /** The floors shown (missing: all). */
  shown?: string[];
  /** The height of a scene level's floor, pixels (none: the ground's). */
  floorOf?(level: string | undefined): number | undefined;
}

/** How high a placed light hangs over the ground: a torch on a wall, feet. */
const HANG = 8;
/** A carried light shines from this share of the creature's height. */
const CHEST = 0.8;

function lampOf(key: string, light: Light, at: Lamp['at'], px: number): Lamp {
  return {
    key,
    at,
    color: new THREE.Color(light.color ?? '#ffe8c0').getHex(),
    reach: (light.bright + light.dim) * px,
    strength: light.luminosity ?? 1,
    ...(light.animation && { animation: light.animation }),
  };
}

/** The lights that shine now, placed and carried; magical darkness is left to the flat map. */
export function lampsOf(input: LampInput): Lamp[] {
  const out: Lamp[] = [];
  for (const l of input.placed) {
    if (l.darkness || !lightShines(l, input.darkness) || !onLevels(l, input.shown)) continue;
    const under = Math.max(input.groundAt([l.x, l.y]), input.floorOf?.(l.level) ?? -Infinity);
    const at: Lamp['at'] = [l.x, l.y, under + HANG * input.px];
    out.push(lampOf(`light:${l.id}`, l, at, input.px));
  }
  for (const c of input.carried) {
    if (c.light.darkness) continue;
    out.push(lampOf(`token:${c.id}`, c.light, [c.at[0], c.at[1], c.feet + c.size * CHEST], input.px));
  }
  return out;
}

/** The `max` lamps nearest `target` on the map. */
export function nearestLamps(lamps: readonly Lamp[], target: Point, max: number): Lamp[] {
  const away = (l: Lamp) => Math.hypot(l.at[0] - target[0], l.at[1] - target[1]);
  return [...lamps].sort((a, b) => away(a) - away(b)).slice(0, max);
}

/** How brightly a lamp shines at `ms` (page time): stronger the darker the scene, a torch flickering, a glow pulsing. */
export function lampPower(lamp: Lamp, ms: number, darkness: number): number {
  const base = 1.6 * lamp.strength * (0.35 + 0.65 * darkness);
  const s = ms / 1000;
  if (lamp.animation === 'flicker') return base * (0.82 + 0.1 * Math.sin(s * 11.3) + 0.08 * Math.sin(s * 23.7 + 1.3));
  if (lamp.animation === 'pulse') return base * (0.8 + 0.2 * Math.sin(s * 2.4));
  return base;
}

/** A fixed pool of point lights, shown on the nearest lamps. */
export class Lamps {
  readonly group = new THREE.Group();
  private pool: THREE.PointLight[];

  constructor(size: number) {
    this.pool = Array.from({ length: size }, () => {
      const light = new THREE.PointLight(0xffffff, 0, 1, 0);
      this.group.add(light);
      return light;
    });
  }

  /** Lights the lamps nearest `target`; the rest of the pool goes dark. */
  show(lamps: readonly Lamp[], target: Point, ms: number, darkness: number): void {
    const near = nearestLamps(lamps, target, this.pool.length);
    this.pool.forEach((light, i) => {
      const lamp = near[i];
      light.intensity = lamp ? lampPower(lamp, ms, darkness) : 0;
      if (!lamp) return;
      light.color.setHex(lamp.color);
      light.distance = lamp.reach;
      light.position.set(lamp.at[0], lamp.at[2], lamp.at[1]);
    });
  }
}
