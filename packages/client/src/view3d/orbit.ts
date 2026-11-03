import type { Point } from '@vtt/shared';

// The 3D view's camera, as in Baldur's Gate 3: it circles a point on the
// ground. Zooming in brings it down behind the shoulder, zooming out lifts it
// towards looking straight down; the tactical view looks straight down.
// Map coordinates: x east, y south (pixels, as on the 2D map), z up (pixels).
// Pure maths; view3d/View3D.ts turns it into a three.js camera.

/** A point on the map, with its height in pixels. */
export type MapPoint = readonly [number, number, number];

export interface Orbit {
  /** What the camera looks at. */
  target: MapPoint;
  /** Radians the camera has turned clockwise round the target, seen from above; 0 stands south, facing north. */
  yaw: number;
  /** From the eye to the target, in pixels. */
  distance: number;
  /** Looking straight down (BG3's tactical camera). */
  tactical: boolean;
}

const DEG = Math.PI / 180;

/** The camera's limits; distances in squares. */
export const ORBIT = {
  minDistance: 3,
  maxDistance: 120,
  /** Pitch (down from level) when closest and farthest. */
  lowPitch: 32 * DEG,
  highPitch: 68 * DEG,
  tacticalPitch: 89 * DEG,
  /** How far from the target the ground drawn reaches, in squares. */
  maxReach: 90,
  /** A wheel notch scales the distance by this. */
  zoomStep: 1.15,
  /** How quickly the camera catches up with a creature it follows, per second. */
  followRate: 6,
} as const;

/** How far down from level the camera looks. */
export function pitchOf(o: Orbit, grid: number): number {
  if (o.tactical) return ORBIT.tacticalPitch;
  const span = (ORBIT.maxDistance - ORBIT.minDistance) * grid;
  const t = Math.min(1, Math.max(0, (o.distance - ORBIT.minDistance * grid) / span));
  // Eases: most of the tilt happens close in, as BG3's does.
  const eased = Math.sqrt(t);
  return ORBIT.lowPitch + (ORBIT.highPitch - ORBIT.lowPitch) * eased;
}

/** Where the camera is. */
export function eyeOf(o: Orbit, grid: number): MapPoint {
  const pitch = pitchOf(o, grid);
  const flat = Math.cos(pitch) * o.distance;
  return [
    o.target[0] + Math.sin(o.yaw) * flat,
    o.target[1] + Math.cos(o.yaw) * flat,
    o.target[2] + Math.sin(pitch) * o.distance,
  ];
}

/** Wheel notches in (negative) or out, within the limits. */
export function zoomBy(o: Orbit, notches: number, grid: number): Orbit {
  const distance = o.distance * ORBIT.zoomStep ** notches;
  const clamped = Math.min(ORBIT.maxDistance * grid, Math.max(ORBIT.minDistance * grid, distance));
  return { ...o, distance: clamped };
}

export function rotateBy(o: Orbit, radians: number): Orbit {
  return { ...o, yaw: o.yaw + radians };
}

/** Moves the target by `[right, down]` pixels as the camera faces (down = towards the camera). */
export function panBy(o: Orbit, [right, down]: Point): Orbit {
  const [c, s] = [Math.cos(o.yaw), Math.sin(o.yaw)];
  const [x, y, z] = o.target;
  return { ...o, target: [x + right * c + down * s, y - right * s + down * c, z] };
}

/** Eases the target towards `goal` over `dt` seconds. */
export function follow(o: Orbit, goal: MapPoint, dt: number): Orbit {
  const k = 1 - Math.exp(-ORBIT.followRate * dt);
  const target = o.target.map((v, i) => v + (goal[i]! - v) * k) as unknown as MapPoint;
  return { ...o, target };
}

type Vec = [number, number, number];
const sub = (a: MapPoint, b: MapPoint): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec, b: Vec, k = 1): Vec => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec): Vec => {
  const n = Math.hypot(...a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** The camera's lens: vertical field of view in degrees, and width over height. */
export interface Lens {
  fov: number;
  aspect: number;
  grid: number;
}

/** The directions to the four corners of the picture. */
function cornerRays(o: Orbit, lens: Lens): { eye: MapPoint; rays: Vec[] } {
  const eye = eyeOf(o, lens.grid);
  const forward = unit(sub(o.target, eye));
  // Map y runs south, so "up" for a camera is +z; right is forward × up with a left-handed map.
  const right = unit(cross([0, 0, 1], forward));
  const up = cross(forward, right);
  const v = Math.tan((lens.fov * DEG) / 2);
  const h = v * lens.aspect;
  const rays = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => add(add(forward, right, sx * h), up, sy * v)));
  return { eye, rays };
}

/**
 * The square of ground the camera sees, which the 2D map draws for it: its
 * centre and half its side, in pixels. Ground past the horizon (or farther
 * than `maxReach`) is cut off at that reach.
 */
export function groundSquare(o: Orbit, lens: Lens): { center: Point; half: number } {
  const { eye, rays } = cornerRays(o, lens);
  const reach = ORBIT.maxReach * lens.grid;
  const points = rays.map((d): Point => {
    const flat = Math.hypot(d[0], d[1]) || 1;
    const t = d[2] < 0 ? (o.target[2] - eye[2]) / d[2] : Infinity;
    const at: Point = [eye[0] + d[0] * t, eye[1] + d[1] * t];
    const off: Point = [at[0] - o.target[0], at[1] - o.target[1]];
    const far = Math.hypot(...off);
    if (Number.isFinite(far) && far <= reach) return at;
    return [o.target[0] + (d[0] / flat) * reach, o.target[1] + (d[1] / flat) * reach];
  });
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return { center: [(x0 + x1) / 2, (y0 + y1) / 2], half: Math.min(reach, Math.max(x1 - x0, y1 - y0) / 2) };
}
