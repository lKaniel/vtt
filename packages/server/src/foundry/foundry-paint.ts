import { mediaKind } from '@vtt/core';
import type { ColorSwap, Overlay, Paint3D, Solid3D } from '@vtt/shared';

// 3D Canvas (levels-3d-preview, shaders/ShaderLib.js) repaints a model or
// terrain with its shaders: colorswap turns colours near a source colour
// (within threshold × the widest gap) into the target tinted by their
// brightness, and overlay lays a picture over the top, by height and
// flatness. They become `paint` (shared paint3d.ts).

type Flags = Record<string, unknown>;
type MediaFind = (path: string) => string | undefined;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const shader = (f: Flags, name: string) => {
  const s = (f.shaders as Flags | undefined)?.[name] as Flags | undefined;
  return s?.enabled === true ? s : undefined;
};

/** The colour swaps that are on (a threshold above 0), in the order 3D Canvas tries them. */
function swapsOf(f: Flags): ColorSwap[] {
  const s = shader(f, 'colorswap');
  if (!s) return [];
  return [1, 2, 3].flatMap((i) => {
    const [from, to, within] = [str(s[`sourceColor${i}`]), str(s[`targetColor${i}`]), num(s[`threshold${i}`])];
    return from && to && within && within > 0 ? [{ from, to, within: Math.min(1, within) }] : [];
  });
}

/** Where it shows: by height (`cover`) and by flatness (`slope`), each left out when it covers all. */
function reachOf(s: Flags): Partial<Overlay> {
  const cover = num(s.coveragePercent);
  const slope = num(s.inclination);
  const share = (n: number | undefined) => (n !== undefined && n !== 0 && Math.abs(n) <= 1 ? n : undefined);
  const [c, sl] = [cover === 1 ? undefined : share(cover), share(slope)];
  return { ...(c !== undefined && { cover: c }), ...(sl !== undefined && { slope: sl }) };
}

/** The overlay, if it is on, shows at all and its picture came along. */
function overlayOf(f: Flags, find: MediaFind): Overlay | undefined {
  const s = shader(f, 'overlay');
  const path = s && str(s.textureDiffuse);
  const strength = s && num(s.strength);
  const src = path && mediaKind(path) === 'image' ? find(path) : undefined;
  if (!s || !src || !strength || strength <= 0) return undefined;
  return { src, ...tintOf(s), strength: Math.min(1, strength), ...repeatOf(s), ...reachOf(s), ...blendOf(s) };
}

function tintOf(s: Flags): Partial<Overlay> {
  const color = str(s.color);
  return color && color.toLowerCase() !== '#ffffff' ? { color } : {};
}

function repeatOf(s: Flags): Partial<Overlay> {
  const repeat = num(s.repeat);
  return repeat && repeat > 0 && repeat !== 1 ? { repeat } : {};
}

/** How it meets what is under it: added, multiplied or laid over; its black clear or not. */
function blendOf(s: Flags): Partial<Overlay> {
  const clear = s.black_alpha === true ? { blackClear: true } : {};
  if (s.add_blend === true) return { ...clear, blend: 'add' };
  if (s.mult_blend === true) return { ...clear, blend: 'multiply' };
  return clear;
}

/** A 3D Canvas tile's colour swaps and overlay, if it has any. */
export function paintOf(f: Flags, find: MediaFind): Paint3D | undefined {
  const swaps = swapsOf(f);
  const overlay = overlayOf(f, find);
  if (!swaps.length && !overlay) return undefined;
  return { ...(swaps.length && { swaps }), ...(overlay && { overlay }) };
}

/** 3D Canvas's material settings: transparency, roughness and metalness count from 0 (below 0 is unset); transparency 1 is solid. */
export function surfaceOf(f: Flags): Pick<Solid3D, 'opacity' | 'roughness' | 'metalness'> {
  const share = (v: unknown) => {
    const n = num(v);
    return n !== undefined && n >= 0 && n <= 1 ? n : undefined;
  };
  const opacity = share(f.transparency);
  const [roughness, metalness] = [share(f.roughness), share(f.metalness)];
  return {
    ...(opacity !== undefined && opacity < 1 && { opacity }),
    ...(roughness !== undefined && { roughness }),
    ...(metalness !== undefined && { metalness }),
  };
}

const KINDS = ['Color', 'Roughness', 'Metalness', 'AmbientOcclusion', 'NormalGL', 'Emissive'];

/** A PBR picture's ("…_Color.webp") roughness, metalness and normal maps beside it, as 3D Canvas finds them. */
export function mapsBeside(path: string, find: MediaFind): Solid3D['maps'] {
  if (!KINDS.some((k) => path.includes(k))) return undefined;
  const ext = path.split('.').pop()!;
  const stem = KINDS.reduce((p, k) => p.replace(k, ''), path.slice(0, -ext.length - 1));
  const at = (kind: string) => find(`${stem}${kind}.${ext}`);
  const [roughness, metalness, normal] = [at('Roughness'), at('Metalness'), at('NormalGL')];
  if (!roughness && !metalness && !normal) return undefined;
  return { ...(roughness && { roughness }), ...(metalness && { metalness }), ...(normal && { normal }) };
}
