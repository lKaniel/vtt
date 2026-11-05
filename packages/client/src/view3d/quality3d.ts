import { readPref, writePref } from '../prefs.ts';

// How good the 3D view looks against how fast it runs, chosen per browser in
// the settings (Graphics): Low for software drawing, phones and old laptops,
// Medium for built-in laptop graphics, High for a graphics card. "Auto" picks
// one from the graphics the browser reports. Everything costly in the view
// reads it: resolution, smoothing, the ground picture, how far small things
// show, how many lights shine on models, how big textures may be, and how
// often a still view is drawn.

export type QualityLevel = 'low' | 'medium' | 'high';
export type QualityChoice = 'auto' | QualityLevel;

export interface Quality3D {
  level: QualityLevel;
  /** The most screen pixels drawn per CSS pixel. */
  pixelRatio: number;
  /** While frames are slow the resolution drops, to no less than this share. */
  lowestScale: number;
  /** Smoothed edges (multisampling). */
  antialias: boolean;
  /** Side of the ground picture the 2D map draws, pixels. */
  groundPixels: number;
  /** How often a still ground is drawn again (flickering lights), a second. */
  groundRefresh: number;
  /** Things that look smaller than this (size over distance) are left out. */
  tiny: number;
  /** The most scene lights shining on models at once. */
  lights: number;
  /** The longest side a model's texture keeps, pixels. */
  textureMax: number;
  /** How often a view where nothing moves is drawn, a second. */
  idleFps: number;
}

export const QUALITY: Record<QualityLevel, Quality3D> = {
  low: {
    level: 'low',
    pixelRatio: 1,
    lowestScale: 0.5,
    antialias: false,
    groundPixels: 1024,
    groundRefresh: 8,
    tiny: 0.02,
    lights: 2,
    textureMax: 512,
    idleFps: 15,
  },
  medium: {
    level: 'medium',
    pixelRatio: 1.5,
    lowestScale: 0.6,
    antialias: true,
    groundPixels: 2048,
    groundRefresh: 15,
    tiny: 0.015,
    lights: 6,
    textureMax: 1024,
    idleFps: 30,
  },
  high: {
    level: 'high',
    pixelRatio: 2,
    lowestScale: 0.7,
    antialias: true,
    groundPixels: 2048,
    groundRefresh: 30,
    tiny: 0.008,
    lights: 12,
    textureMax: 4096,
    idleFps: 60,
  },
};

/** What the browser says of its graphics: the renderer's name, and the device's memory (GB) when known. */
export interface Graphics {
  gpu: string;
  memory?: number;
}

const WEAK = /swiftshader|llvmpipe|software|softpipe|mali|adreno|powervr|videocore|hd graphics [2-5]\d{3}\b|gma/i;
const BUILT_IN = /intel|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics/i;

/** The level that suits these graphics. */
export function levelFor({ gpu, memory }: Graphics): QualityLevel {
  if (WEAK.test(gpu) || (memory !== undefined && memory <= 2)) return 'low';
  if (BUILT_IN.test(gpu) || (memory !== undefined && memory <= 4)) return 'medium';
  return 'high';
}

/** The settings for a choice: a level as chosen, or the one that suits the graphics for auto. */
export function qualityOf(choice: QualityChoice, graphics: Graphics): Quality3D {
  return QUALITY[choice === 'auto' ? levelFor(graphics) : choice];
}

const CHOICES: readonly QualityChoice[] = ['auto', 'low', 'medium', 'high'];

/** This browser's choice. */
export const currentQuality = (): QualityChoice => readPref('quality3d', CHOICES, 'auto');

const listeners = new Set<() => void>();

/** Keeps a new choice in this browser; an open 3D view starts again with it. */
export function setQuality(choice: QualityChoice): void {
  writePref('quality3d', choice);
  for (const fn of listeners) fn();
}

/** Calls `fn` when the choice changes; returns the way to stop. */
export function onQualityChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let graphics: Graphics | undefined;

/** What the browser reports of its graphics, asked once of a small WebGL canvas. */
function probe(): Graphics {
  const memory = (globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory;
  return { gpu: gpuName(), ...(memory !== undefined && { memory }) };
}

/** The graphics card's name; "software" with no WebGL 2 at all. */
function gpuName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    return gl ? rendererOf(gl) : 'software';
  } catch {
    return '';
  }
}

function rendererOf(gl: WebGL2RenderingContext): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return name;
}

/** The settings the 3D view runs with now. */
export function quality3d(): Quality3D {
  graphics ??= probe();
  return qualityOf(currentQuality(), graphics);
}

/** The size a picture `w` × `h` is halved down to so its longer side is at most `max`; undefined when it fits. */
export function shrunkSize(w: number, h: number, max: number): [number, number] | undefined {
  if (Math.max(w, h) <= max) return undefined;
  let [x, y] = [w, h];
  while (Math.max(x, y) > max) [x, y] = [Math.max(1, Math.round(x / 2)), Math.max(1, Math.round(y / 2))];
  return [x, y];
}
