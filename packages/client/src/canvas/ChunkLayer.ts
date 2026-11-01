import type { Chunk, Wall } from '@vtt/shared';
import { assetUrl } from '../assets.ts';
import { Assets, Circle, Container, Graphics, Sprite } from 'pixi.js';
import { rectTile, type GroundContext } from './art/ground.ts';
import { drawDoor, drawWalls, drawWallShadows } from './art/walls.ts';
import type { Session } from '../session.ts';

const DOOR_COLORS = { closed: 0xd08a3a, open: 0x7ac06a, locked: 0xd04a4a } as const;
const DOOR_HANDLE_RADIUS = 11;

interface ChunkView {
  /** The chunk's tiles and wall shadows: each sits straight in `ground`, so tiles of all chunks stack by `z`. */
  ground: Container[];
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
  private views = new Map<string, ChunkView>();

  constructor(private session: Session) {}

  get keys(): string[] {
    return [...this.views.keys()];
  }

  draw(key: string, chunk: Chunk): void {
    this.remove(key);
    const view: ChunkView = { ground: [], walls: new Container(), doors: [] };
    view.walls.cullable = true;
    const world = this.session.world;
    view.ground = drawTiles(chunk, { gridSize: world?.gridSize ?? 100, chunkSize: world?.chunkSize ?? 2000 });
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
    this.walls.addChild(view.walls);
    this.views.set(key, view);
  }

  remove(key: string): boolean {
    const v = this.views.get(key);
    if (!v) return false;
    for (const item of v.ground) item.destroy({ children: true });
    v.walls.destroy({ children: true });
    this.views.delete(key);
    return true;
  }

  showDoors(visible: boolean): void {
    for (const v of this.views.values()) for (const d of v.doors) d.visible = visible;
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

/** The chunk's tiles, each at its place in the scene's draw order. */
function drawTiles(chunk: Chunk, ctx: GroundContext): Container[] {
  return chunk.tiles.map((tile, i) => {
    const drawn = tile.kind === 'rect' ? rectTile(tile, ctx) : imageTile(tile);
    drawn.zIndex = tile.z ?? i;
    return drawn;
  });
}

function imageTile(tile: Extract<Chunk['tiles'][number], { kind: 'image' }>): Sprite {
  const sprite = new Sprite();
  sprite.position.set(tile.x, tile.y);
  Assets.load(assetUrl(tile.src))
    .then((texture: Sprite['texture']) => {
      if (sprite.destroyed) return;
      sprite.texture = texture;
      sprite.width = tile.w;
      sprite.height = tile.h;
    })
    .catch(() => {
      console.warn(`Missing image assets/${tile.src}`);
    });
  return sprite;
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
