import type { Doc } from '@vtt/core';
import { encodePng } from './png.ts';
import { type Pen, Raster, rgba, type Rgba } from './raster.ts';

// A top-down sketch of a scene for Claude to look at after building it:
// floors in their colours, walls white, doors orange, windows blue, lights
// as glows, regions outlined, creatures as discs. Pictures (image tiles) are
// boxes, since the server can't decode them; the legend lists what's where.

type Pt = [number, number];

export interface SceneItems {
  /** The scene document (gridSize, background). */
  scene: Doc;
  /** The scene's documents by collection name: tiles, walls, lights, tokens... */
  items: Partial<Record<string, Doc[]>>;
  /** Actors, for token names and sizes. */
  actors: readonly Doc[];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GROUND = '#8a8a8a';
const TEXTURE_COLORS: Record<string, string> = { grass: '#7a9a55', water: '#4a7aa8', wood: '#9a7048', dirt: '#8a6a48' };
const COLOURS = {
  wall: rgba('#f2f2f2'),
  door: rgba('#ff9a2a'),
  secret: rgba('#c060ff'),
  window: rgba('#7ac8ff'),
  limited: rgba('#7fd07f'),
  ethereal: rgba('#b0b0b0'),
  image: rgba('#5a6070', 0.85),
  imageEdge: rgba('#c8d0e0'),
  light: rgba('#ffd060', 0.55),
  bright: rgba('#ffe090', 0.14),
  darkness: rgba('#000000', 0.45),
  region: rgba('#ff40c0', 0.18),
  regionEdge: rgba('#ff40c0'),
  linked: rgba('#3ccf6a'),
  foe: rgba('#e04040'),
  hidden: rgba('#9a9a9a'),
  outline: rgba('#ffffff'),
  note: rgba('#30e0e0'),
  sound: rgba('#5a8aff'),
  grid: rgba('#000000', 0.14),
};

const num = (v: unknown, or = 0): number => (typeof v === 'number' ? v : or);
const pt = (v: unknown): Pt => (Array.isArray(v) ? [num(v[0]), num(v[1])] : [0, 0]);

/** Every point an item covers, to frame the picture. */
function extent(coll: string, d: Doc): Pt[] {
  if (coll === 'walls') return [pt(d.a), pt(d.b)];
  if (Array.isArray(d.points)) return d.points.map(pt);
  if (typeof d.x !== 'number' || typeof d.y !== 'number') return [];
  return [
    [d.x, d.y],
    [d.x + num(d.w), d.y + num(d.h)],
  ];
}

/** The part of the scene with anything on it, a square round it. */
function sceneBounds(s: SceneItems): Box {
  const grid = num(s.scene.gridSize, 100);
  const pts = Object.entries(s.items).flatMap(([coll, docs]) => (docs ?? []).flatMap((d) => extent(coll, d)));
  if (!pts.length) return { x: 0, y: 0, w: grid * 20, h: grid * 20 };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs) - grid, Math.min(...ys) - grid];
  return { x: x0, y: y0, w: Math.max(...xs) + grid - x0, h: Math.max(...ys) + grid - y0 };
}

/** Maps scene pixels onto the picture. */
class View {
  constructor(
    readonly box: Box,
    readonly scale: number,
  ) {}

  p = ([x, y]: Pt): Pt => [(x - this.box.x) * this.scale, (y - this.box.y) * this.scale];
  len = (v: number): number => v * this.scale;
}

function tileColour(t: Doc): Rgba {
  const tex = typeof t.texture === 'string' ? TEXTURE_COLORS[t.texture] : undefined;
  const colour = typeof t.color === 'string' ? t.color : (tex ?? GROUND);
  return rgba(colour, t.hidden ? 0.4 : 1);
}

function drawTile(r: Raster, v: View, t: Doc): void {
  const [x, y] = v.p([num(t.x), num(t.y)]);
  const box = { x, y, w: v.len(num(t.w)), h: v.len(num(t.h)) };
  if (t.kind !== 'image') return r.rect(box, tileColour(t));
  r.rect(box, COLOURS.image);
  outline(r, box, COLOURS.imageEdge);
  r.line([x, y], [x + box.w, y + box.h], { colour: COLOURS.imageEdge });
}

/** Ground first, then the rest in file order; groups have no picture. */
function drawTiles(r: Raster, v: View, tiles: readonly Doc[]): void {
  const ground = (t: Doc) => (t.background === true ? 0 : 1);
  const drawn = tiles.filter((t) => t.kind !== 'group' && typeof t.x === 'number');
  drawn.sort((a, b) => ground(a) - ground(b));
  for (const t of drawn) drawTile(r, v, t);
}

function outline(r: Raster, { x, y, w, h }: Box, colour: Rgba): void {
  const c: Pt[] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  c.forEach((p, i) => r.line(p, c[(i + 1) % 4]!, { colour }));
}

function drawGrid(r: Raster, v: View, grid: number): void {
  const step = v.len(grid);
  if (step < 6) return;
  const start = (o: number) => Math.ceil(o / grid) * grid;
  for (let x = start(v.box.x); x <= v.box.x + v.box.w; x += grid)
    r.rect({ x: v.len(x - v.box.x), y: 0, w: 1, h: r.height }, COLOURS.grid);
  for (let y = start(v.box.y); y <= v.box.y + v.box.h; y += grid)
    r.rect({ x: 0, y: v.len(y - v.box.y), w: r.width, h: 1 }, COLOURS.grid);
}

function lightColour(l: Doc): { glow: Rgba; core: Rgba } {
  if (l.darkness) return { glow: COLOURS.darkness, core: COLOURS.darkness };
  if (typeof l.color !== 'string') return { glow: COLOURS.light, core: COLOURS.bright };
  return { glow: rgba(l.color, 0.55), core: rgba(l.color, 0.14) };
}

function drawLights(r: Raster, v: View, lights: readonly Doc[], grid: number): void {
  const ft = (feet: number) => v.len((feet / 5) * grid);
  for (const l of lights) {
    const [x, y] = v.p([num(l.x), num(l.y)]);
    const { glow, core } = lightColour(l);
    // Bright light as a soft disc, how far dim light reaches as a thin ring.
    const outer = ft(num(l.bright) + num(l.dim));
    if (l.darkness) {
      r.disc([x, y], outer, core);
    } else {
      r.disc([x, y], ft(num(l.bright)), core);
      r.ring([x, y], outer, glow, 1);
    }
    r.disc([x, y], 3, rgba('#ffe060'));
  }
}

function drawRegions(r: Raster, v: View, regions: readonly Doc[]): void {
  for (const g of regions) {
    const pts = (Array.isArray(g.points) ? g.points : []).map((p) => v.p(pt(p)));
    if (pts.length < 3) continue;
    r.polygon(pts, typeof g.color === 'string' ? rgba(g.color, 0.18) : COLOURS.region);
    pts.forEach((p, i) => r.line(p, pts[(i + 1) % pts.length]!, { colour: COLOURS.regionEdge, dash: 4 }));
  }
}

function wallStyle(w: Doc): Pen {
  if (w.door) return { colour: w.secret ? COLOURS.secret : COLOURS.door, width: 5, dash: w.door === 'open' ? 3 : 0 };
  if (w.move === 'none') return { colour: COLOURS.ethereal, width: 2, dash: 3 };
  if (w.sight === 'none') return { colour: COLOURS.window, width: 3, dash: 0 };
  if (w.sight === 'limited') return { colour: COLOURS.limited, width: 2, dash: 4 };
  return { colour: COLOURS.wall, width: 3, dash: 0 };
}

function drawWalls(r: Raster, v: View, walls: readonly Doc[]): void {
  for (const w of walls) {
    r.line(v.p(pt(w.a)), v.p(pt(w.b)), wallStyle(w));
  }
}

function colourOf(t: Doc): Rgba {
  if (t.hidden) return COLOURS.hidden;
  return t.linked ? COLOURS.linked : COLOURS.foe;
}

function drawTokens(r: Raster, v: View, tokens: readonly Doc[], s: SceneItems): void {
  const grid = num(s.scene.gridSize, 100);
  for (const t of tokens) {
    const actor = s.actors.find((a) => a.id === t.actor);
    const size = num(t.size, num(actor?.size, 1));
    const [x, y] = v.p([num(t.x), num(t.y)]);
    const rad = Math.max(3, v.len((size * grid) / 2) * 0.8);
    r.disc([x, y], rad, colourOf(t));
    r.ring([x, y], rad, COLOURS.outline, 1.5);
  }
}

function drawMarks(r: Raster, v: View, s: SceneItems): void {
  for (const n of s.items.notes ?? []) {
    const [x, y] = v.p([num(n.x), num(n.y)]);
    r.rect({ x: x - 4, y: y - 4, w: 8, h: 8 }, COLOURS.note);
  }
  for (const n of s.items.sounds ?? []) {
    const [x, y] = v.p([num(n.x), num(n.y)]);
    r.ring([x, y], 5, COLOURS.sound, 2);
  }
}

/** What the colours mean, and where each creature stands. */
function legend(s: SceneItems, view: View, size: [number, number]): string {
  const name = (t: Doc) => {
    const delta = t.delta as { name?: string } | undefined;
    const actorName = s.actors.find((a) => a.id === t.actor)?.name;
    const named = [delta?.name, t.name, actorName].find((n): n is string => typeof n === 'string');
    return named ?? t.id;
  };
  const { box, scale } = view;
  const lines = [
    `Picture ${size[0]}×${size[1]} px of scene pixels x ${box.x}..${box.x + box.w}, y ${box.y}..${box.y + box.h} (scale ${+scale.toFixed(4)}; square = ${num(s.scene.gridSize, 100)} px).`,
    'Key: white wall, orange door (dashed: open), purple secret door, blue window, green dashed terrain wall, grey dashed ethereal wall,',
    'light: soft disc of bright light, thin ring where dim light ends (dark disc: magical darkness), pink dashed outline region, grey box with a diagonal = picture tile,',
    'green disc linked creature, red disc other creature, grey disc hidden, cyan square note, blue ring sound.',
  ];
  const tokens = s.items.tokens ?? [];
  if (tokens.length) {
    lines.push('Creatures:');
    for (const t of tokens)
      lines.push(`- ${t.id} "${name(t)}" at (${num(t.x)}, ${num(t.y)})${t.hidden ? ' hidden' : ''}`);
  }
  return lines.join('\n');
}

/** A PNG sketch of the scene (or of `area` of it), at most `max` pixels wide or high, and its legend. */
export function sceneSketch(s: SceneItems, max = 1024, area?: Box): { png: Buffer; legend: string } {
  const box = area ?? sceneBounds(s);
  const scale = Math.min(4, max / Math.max(box.w, box.h));
  const size: [number, number] = [Math.max(1, Math.round(box.w * scale)), Math.max(1, Math.round(box.h * scale))];
  const view = new View(box, scale);
  const r = new Raster(size[0], size[1], rgba((s.scene.background as string | undefined) ?? '#1b1d22'));
  const grid = num(s.scene.gridSize, 100);
  drawTiles(r, view, s.items.tiles ?? []);
  drawGrid(r, view, grid);
  drawRegions(r, view, s.items.regions ?? []);
  drawLights(r, view, s.items.lights ?? [], grid);
  drawWalls(r, view, s.items.walls ?? []);
  drawMarks(r, view, s);
  drawTokens(r, view, s.items.tokens ?? [], s);
  return { png: encodePng(size[0], size[1], r.data), legend: legend(s, view, size) };
}
