import {
  canObserve,
  type Chunk,
  isGm,
  levelRank,
  onLevel,
  onLevels,
  type Point,
  type Rect,
  tileClickable,
  type Wall,
} from '@vtt/shared';
import { Circle, Container, Graphics, type Renderer } from 'pixi.js';
import { rectTile, type GroundContext } from './art/ground.ts';
import { drawDoor, drawWalls, drawWallShadows } from './art/walls.ts';
import type { Session } from '../session/session.ts';
import { clickTile, openDoor } from '../play/interact.ts';
import { imageTile, type TileView } from './tile-draw.ts';
import { type RoofEyes, roofWatchers } from './tile-motion.ts';
import { paintedUnder3d } from '../view3d/content3d.ts';
import { bakeRuns, roofStill, tileBounds, tileStill } from './tile-bake.ts';
import { TileBaker } from './TileBaker.ts';

const DOOR_COLORS = { closed: 0xd08a3a, open: 0x7ac06a, locked: 0xd04a4a } as const;
const DOOR_HANDLE_RADIUS = 11;
/** How a tile hidden from players shows to the GM. */
const HIDDEN_ALPHA = 0.45;

type ChunkTile = Chunk['tiles'][number];

/** A drawn floor tile: still ones are baked (TileBaker), live ones sit straight in `ground`. */
interface GroundTile {
  id: string;
  z: number;
  still: boolean;
  root: Container;
  bounds: Rect;
  loaded?: Promise<void>;
}

interface Roof extends GroundTile {
  tile: ChunkTile;
}

interface ChunkView {
  /** The chunk's floor tiles, stacked with those of every chunk by `z`. */
  tiles: GroundTile[];
  shadows: Graphics;
  /** Its overhead tiles (roofs), stacked in `roofs`: baked while fully drawn, live while they fade. */
  roofs: Roof[];
  /** Tiles that move: scrolling pictures and fading roofs. */
  moving: TileView[];
  walls: Container;
  doors: Graphics[];
}

/** Wall shadows draw over every tile. */
const SHADOW_Z = 1e9;
/** Each floor up draws over the ones below it. */
const LEVEL_Z = 1e7;
/** How far past its rectangle a tile may draw (rough edges, see art/ground.ts). */
const EDGE_PAD = 24;

/** Draws the tiles, walls and doors of every loaded chunk. */
export class ChunkLayer {
  /** Floor tiles, under everything else, in the scene's draw order. */
  readonly ground = new Container({ sortableChildren: true });
  /** Walls and doors, above the grid. */
  readonly walls = new Container();
  /** Roofs and canopies, over the creatures. */
  readonly roofs = new Container({ sortableChildren: true, eventMode: 'none' });
  private views = new Map<string, ChunkView>();
  private baker = new TileBaker();
  private roofBaker = new TileBaker();
  /** Tiles came or went since the floor was last stacked. */
  private restack = false;
  /** A roof started or stopped fading. */
  private restackRoofs = false;

  /** `placeOf`: where a token is drawn now, for the roofs it walks under. */
  constructor(
    private session: Session,
    private placeOf: (id: string) => { at: Point } | undefined,
  ) {}

  /** The floors last drawn, to draw again when another is shown. */
  private floor = '';

  /** Moves scrolling tiles on and fades roofs over your creatures; draws another floor when it comes into view, then calls `floorShown`. */
  tick(dt: number, floorShown: () => void): void {
    const watchers = roofWatchers(this.eyes(), this.placeOf);
    for (const v of this.views.values()) for (const t of v.moving) t.tick?.(dt, watchers);
    const { shown, current } = this.session.levels;
    const floor = `${current ?? ''}|${shown?.join(' ') ?? ''}|${this.session.view3d.on}`;
    if (floor !== this.floor) {
      this.floor = floor;
      for (const [key, chunk] of this.session.chunks) this.draw(key, chunk);
      floorShown();
    }
    this.roofsFading();
    if (this.restack) this.stack();
    if (this.restackRoofs) this.stackRoofs();
    this.baker.tick();
    this.roofBaker.tick();
  }

  /** The part of the map on screen, `zoom` its screen pixels per map pixel (before the device's). */
  setView(view: Rect, zoom: number, renderer: Renderer): void {
    this.baker.setView(view, zoom * renderer.resolution, renderer);
    this.roofBaker.setView(view, zoom * renderer.resolution, renderer);
  }

  /** A roof that starts fading comes out of the bake; one fully drawn again goes back in. */
  private roofsFading(): void {
    const gm = this.session.isGm();
    for (const v of this.views.values()) {
      for (const roof of v.roofs) {
        const still = roofStill(roof.tile, gm, roof.root.alpha);
        if (still === roof.still) continue;
        roof.still = still;
        this.restackRoofs = true;
      }
    }
  }

  /** Puts every chunk's floor tiles in draw order: runs of still tiles baked, live ones between them. */
  private stack(): void {
    this.restack = false;
    stackInto(
      this.ground,
      this.baker,
      [...this.views.values()].flatMap((v) => v.tiles),
    );
  }

  private stackRoofs(): void {
    this.restackRoofs = false;
    stackInto(
      this.roofs,
      this.roofBaker,
      [...this.views.values()].flatMap((v) => v.roofs),
    );
  }

  destroy(): void {
    this.baker.destroy();
    this.roofBaker.destroy();
  }

  private eyes(): RoofEyes {
    const { you, selected } = this.session;
    const gm = !you || isGm(you);
    const yours = gm ? [] : [...this.session.tokens.values()].filter((t) => canObserve(t, you)).map((t) => t.id);
    return { gm, yours, selected: selected ? [selected] : [] };
  }

  get keys(): string[] {
    return [...this.views.keys()];
  }

  /** The chunk as the level shown sees it: the tiles of the floors in view, lower ones beneath, and its own walls. */
  private onFloor(chunk: Chunk): Chunk {
    const { shown, current } = this.session.levels;
    if (!shown) return chunk;
    const levels = this.session.world?.levels;
    const rank = (t: Chunk['tiles'][number]) =>
      Math.max(0, ...shown.filter((l) => onLevel(t, l) && (t.level ?? t.levels)).map((l) => levelRank(levels, l)));
    const tiles = chunk.tiles
      .map((t, i) => ({ ...t, z: rank(t) * LEVEL_Z + (t.z ?? i) }))
      .filter((t) => onLevels(t, shown));
    return { ...chunk, tiles, walls: chunk.walls.filter((w) => onLevel(w, current)) };
  }

  /** Under the 3D view, the chunk without what stands in 3D (view3d/content3d.ts). */
  private flat(chunk: Chunk): Chunk {
    if (!this.session.view3d.on) return chunk;
    const look = this.session.world?.view3d;
    return { ...chunk, tiles: chunk.tiles.filter((t) => paintedUnder3d(t, look)) };
  }

  draw(key: string, whole: Chunk): void {
    this.remove(key);
    const chunk = this.flat(this.onFloor(whole));
    const world = this.session.world;
    const ctx = { gridSize: world?.gridSize ?? 100, chunkSize: world?.chunkSize ?? 2000 };
    const gm = this.session.isGm();
    const tiles = drawTiles(chunk, ctx, gm, (root, tile) => this.dress(root, tile));
    const shadows = shadowsOf(chunk.walls);
    shadows.zIndex = SHADOW_Z;
    shadows.cullable = true;
    const view: ChunkView = { ...tiles, shadows, walls: new Container(), doors: [] };
    view.walls.cullable = true;
    view.walls.addChild(wallsOf(chunk.walls));
    for (const wall of chunk.walls) {
      if (!wall.door) continue;
      const door = this.door(key, wall);
      view.doors.push(door);
      view.walls.addChild(door);
    }
    for (const t of [...view.tiles, ...view.roofs]) t.root.cullable = true;
    this.ground.addChild(shadows);
    this.walls.addChild(view.walls);
    this.views.set(key, view);
    this.restack = this.restackRoofs = true;
  }

  remove(key: string): boolean {
    const v = this.views.get(key);
    if (!v) return false;
    for (const t of [...v.tiles, ...v.roofs]) t.root.destroy({ children: true });
    v.shadows.destroy();
    v.walls.destroy({ children: true });
    this.views.delete(key);
    this.restack = this.restackRoofs = true;
    return true;
  }

  showDoors(visible: boolean): void {
    for (const v of this.views.values()) for (const d of v.doors) d.visible = visible;
  }

  /** A tile with a click trigger answers clicks; one hidden from players shows faintly to the GM. */
  private dress(drawn: Container, tile: Chunk['tiles'][number]): void {
    const gm = this.session.isGm();
    if (tile.hidden) drawn.alpha = HIDDEN_ALPHA;
    if (!tileClickable(tile, gm)) return;
    drawn.eventMode = 'static';
    drawn.cursor = 'pointer';
    drawn.on('pointerdown', (e) => e.stopPropagation());
    drawn.on('pointertap', (e) => {
      e.stopPropagation();
      clickTile(this.session, tile.id);
    });
  }

  /** The clickable handle in the middle of a door, coloured by its state. */
  private door(key: string, wall: Wall): Graphics {
    const color = DOOR_COLORS[wall.door ?? 'closed'];
    const mid = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2] as const;
    const door = new Graphics()
      .circle(mid[0], mid[1], DOOR_HANDLE_RADIUS)
      .fill({ color: 0x1b1d22, alpha: 0.7 })
      .stroke({ width: 3, color });
    door.hitArea = new Circle(mid[0], mid[1], DOOR_HANDLE_RADIUS * 2);
    door.eventMode = 'static';
    door.cursor = 'pointer';
    door.on('pointerdown', (e) => {
      e.stopPropagation();
    });
    door.on('pointertap', (e) => {
      e.stopPropagation();
      openDoor(this.session, key, wall, e.shiftKey);
    });
    return door;
  }
}

/** The chunk's tiles at their places in the scene's draw order: floor tiles (still or live), roofs, and those that move; `dress` makes triggers clickable. */
function drawTiles(
  chunk: Chunk,
  ctx: GroundContext,
  gm: boolean,
  dress: (root: Container, tile: ChunkTile) => void,
): Pick<ChunkView, 'tiles' | 'roofs' | 'moving'> {
  const out: Pick<ChunkView, 'tiles' | 'roofs' | 'moving'> = { tiles: [], roofs: [], moving: [] };
  chunk.tiles.forEach((tile, i) => {
    const drawn: TileView = tile.kind === 'rect' ? { root: rectTile(tile, ctx) } : imageTile(tile);
    const z = tile.z ?? i;
    drawn.root.zIndex = z;
    dress(drawn.root, tile);
    if (drawn.tick) out.moving.push(drawn);
    const bounds = tileBounds(tile, padOf(tile));
    const placed = { id: tile.id, z, root: drawn.root, bounds, loaded: drawn.loaded };
    if (tile.kind === 'image' && tile.overhead) out.roofs.push({ ...placed, tile, still: roofStill(tile, gm, 1) });
    else out.tiles.push({ ...placed, still: tileStill(tile, gm) });
  });
  return out;
}

/** How far past its rectangle a tile draws: rough edges, and its drop shadow. */
function padOf(tile: ChunkTile): number {
  const shadow = tile.kind === 'image' ? tile.shadow : undefined;
  return EDGE_PAD + (shadow ? shadow.offset + shadow.blur * 3 : 0);
}

/** Stacks tiles into `layer` in draw order: runs of still ones baked by `baker`, live ones between them. */
function stackInto(layer: Container, baker: TileBaker, tiles: GroundTile[]): void {
  const stack = bakeRuns(tiles);
  const runs = stack.flatMap((s) => ('run' in s ? [{ key: s.run.key, pieces: s.run.items }] : []));
  const baked = baker.layout(runs);
  let run = 0;
  stack.forEach((s, i) => {
    const item = 'run' in s ? baked[run++]! : s.tile.root;
    item.zIndex = i;
    layer.addChild(item);
  });
}

function shadowsOf(walls: readonly Wall[]): Graphics {
  const g = new Graphics();
  drawWallShadows(g, walls);
  return g;
}

/** Walls, windows and door leaves; door handles are added separately so they can hide when zoomed out. */
function wallsOf(walls: readonly Wall[]): Graphics {
  const g = new Graphics();
  drawWalls(g, walls);
  for (const w of walls) if (w.door) drawDoor(g, w);
  return g;
}
