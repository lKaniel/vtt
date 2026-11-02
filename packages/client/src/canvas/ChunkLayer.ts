import { canObserve, type Chunk, isGm, type Point, tileClickable, type Wall } from '@vtt/shared';
import { Circle, Container, Graphics } from 'pixi.js';
import { rectTile, type GroundContext } from './art/ground.ts';
import { drawDoor, drawWalls, drawWallShadows } from './art/walls.ts';
import type { Session } from '../session.ts';
import { imageTile, type TileView } from './tile-draw.ts';
import { type RoofEyes, roofWatchers } from './tile-motion.ts';

const DOOR_COLORS = { closed: 0xd08a3a, open: 0x7ac06a, locked: 0xd04a4a } as const;
const DOOR_HANDLE_RADIUS = 11;
/** How a tile hidden from players shows to the GM. */
const HIDDEN_ALPHA = 0.45;

interface ChunkView {
  /** The chunk's tiles and wall shadows: each sits straight in `ground`, so tiles of all chunks stack by `z`. */
  ground: Container[];
  /** Its overhead tiles (roofs), straight in `roofs`. */
  roofs: Container[];
  /** Tiles that move: scrolling pictures and fading roofs. */
  moving: TileView[];
  walls: Container;
  doors: Graphics[];
}

/** Wall shadows draw over every tile. */
const SHADOW_Z = 1e9;

/** Draws the tiles, walls and doors of every loaded chunk. */
export class ChunkLayer {
  /** Floor tiles, under everything else, in the scene's draw order. */
  readonly ground = new Container({ sortableChildren: true });
  /** Walls and doors, above the grid. */
  readonly walls = new Container();
  /** Roofs and canopies, over the creatures. */
  readonly roofs = new Container({ sortableChildren: true, eventMode: 'none' });
  private views = new Map<string, ChunkView>();

  /** `placeOf`: where a token is drawn now, for the roofs it walks under. */
  constructor(
    private session: Session,
    private placeOf: (id: string) => { at: Point } | undefined,
  ) {}

  /** Moves scrolling tiles on and fades roofs over your creatures. */
  tick(dt: number): void {
    const watchers = roofWatchers(this.eyes(), this.placeOf);
    for (const v of this.views.values()) for (const t of v.moving) t.tick?.(dt, watchers);
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

  draw(key: string, chunk: Chunk): void {
    this.remove(key);
    const world = this.session.world;
    const ctx = { gridSize: world?.gridSize ?? 100, chunkSize: world?.chunkSize ?? 2000 };
    const tiles = drawTiles(chunk, ctx, (root, tile) => this.dress(root, tile));
    const view: ChunkView = { ...tiles, walls: new Container(), doors: [] };
    view.walls.cullable = true;
    const shadows = shadowsOf(chunk.walls);
    shadows.zIndex = SHADOW_Z;
    view.ground.push(shadows);
    view.walls.addChild(wallsOf(chunk.walls));
    for (const wall of chunk.walls) {
      if (!wall.door) continue;
      const door = this.door(key, wall);
      view.doors.push(door);
      view.walls.addChild(door);
    }
    for (const item of view.ground) {
      item.cullable = true;
      this.ground.addChild(item);
    }
    for (const roof of view.roofs) this.roofs.addChild(roof);
    this.walls.addChild(view.walls);
    this.views.set(key, view);
  }

  remove(key: string): boolean {
    const v = this.views.get(key);
    if (!v) return false;
    for (const item of [...v.ground, ...v.roofs]) item.destroy({ children: true });
    v.walls.destroy({ children: true });
    this.views.delete(key);
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
      const s = this.session;
      const acting = s.selected ? s.tokens.get(s.selected) : undefined;
      s.useTile(tile.id, acting && s.canControl(acting) ? acting.id : undefined);
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
      this.toggle(key, wall, e.shiftKey);
    });
    return door;
  }

  /** Click opens or closes; shift-click lets the GM lock or unlock. */
  private toggle(key: string, wall: Wall, shift: boolean): void {
    const isGm = this.session.isGm();
    if (isGm && shift) this.session.setDoor(key, wall.id, wall.door === 'locked' ? 'closed' : 'locked');
    else if (wall.door === 'locked') this.session.showError('The door is locked');
    else this.session.setDoor(key, wall.id, wall.door === 'open' ? 'closed' : 'open');
  }
}

/** The chunk's tiles, each at its place in the scene's draw order: floor tiles, roofs, and those that move; `dress` makes triggers clickable. */
function drawTiles(
  chunk: Chunk,
  ctx: GroundContext,
  dress: (root: Container, tile: Chunk['tiles'][number]) => void,
): Pick<ChunkView, 'ground' | 'roofs' | 'moving'> {
  const out: Pick<ChunkView, 'ground' | 'roofs' | 'moving'> = { ground: [], roofs: [], moving: [] };
  chunk.tiles.forEach((tile, i) => {
    const drawn = tile.kind === 'rect' ? { root: rectTile(tile, ctx) } : imageTile(tile);
    drawn.root.zIndex = tile.z ?? i;
    dress(drawn.root, tile);
    (tile.kind === 'image' && tile.overhead ? out.roofs : out.ground).push(drawn.root);
    if (drawn.tick) out.moving.push(drawn);
  });
  return out;
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
