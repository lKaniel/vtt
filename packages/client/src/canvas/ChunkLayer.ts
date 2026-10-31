import type { Chunk, Wall } from '@vtt/shared';
import { Assets, Container, Graphics, Sprite } from 'pixi.js';
import type { Session } from '../session.ts';

const DOOR_COLORS = { closed: 0xd08a3a, open: 0x7ac06a, locked: 0xd04a4a } as const;
const WALL_COLOR = 0x111111;
const WALL_WIDTH = 10;
const DOOR_HANDLE_RADIUS = 16;

interface ChunkView {
  ground: Container;
  walls: Container;
  doors: Graphics[];
}

/** Draws the tiles, walls and doors of every loaded chunk. */
export class ChunkLayer {
  /** Floor tiles, under everything else. */
  readonly ground = new Container();
  /** Walls and doors, above the grid. */
  readonly walls = new Container();
  private views = new Map<string, ChunkView>();

  constructor(private session: Session) {}

  get keys(): string[] {
    return [...this.views.keys()];
  }

  draw(key: string, chunk: Chunk): void {
    this.remove(key);
    const view: ChunkView = { ground: new Container(), walls: new Container(), doors: [] };
    view.ground.cullable = true;
    view.walls.cullable = true;
    drawTiles(view.ground, chunk);
    view.walls.addChild(wallLines(chunk.walls));
    for (const wall of chunk.walls) {
      if (!wall.door) continue;
      const door = this.door(key, wall);
      view.doors.push(door);
      view.walls.addChild(door);
    }
    this.ground.addChild(view.ground);
    this.walls.addChild(view.walls);
    this.views.set(key, view);
  }

  remove(key: string): boolean {
    const v = this.views.get(key);
    if (!v) return false;
    v.ground.destroy({ children: true });
    v.walls.destroy({ children: true });
    this.views.delete(key);
    return true;
  }

  showDoors(visible: boolean): void {
    for (const v of this.views.values()) for (const d of v.doors) d.visible = visible;
  }

  private door(key: string, wall: Wall): Graphics {
    const state = wall.door ?? 'closed';
    const color = DOOR_COLORS[state];
    const open = state === 'open';
    const door = new Graphics()
      .moveTo(...wall.a)
      .lineTo(...wall.b)
      .stroke({ width: open ? 4 : WALL_WIDTH, color, alpha: open ? 0.6 : 1 });
    const mid = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2] as const;
    door.circle(mid[0], mid[1], DOOR_HANDLE_RADIUS).fill({ color: 0x1b1d22, alpha: 0.85 }).stroke({ width: 4, color });
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

function drawTiles(into: Container, chunk: Chunk): void {
  const rects = new Graphics();
  into.addChild(rects);
  for (const tile of chunk.tiles) {
    if (tile.kind === 'rect') {
      rects.rect(tile.x, tile.y, tile.w, tile.h).fill(tile.color);
      continue;
    }
    const sprite = new Sprite();
    sprite.position.set(tile.x, tile.y);
    into.addChild(sprite);
    Assets.load(`/assets/${tile.src}`)
      .then((texture: Sprite['texture']) => {
        if (sprite.destroyed) return;
        sprite.texture = texture;
        sprite.width = tile.w;
        sprite.height = tile.h;
      })
      .catch(() => {
        console.warn(`Missing image assets/${tile.src}`);
      });
  }
}

function wallLines(walls: readonly Wall[]): Graphics {
  const lines = new Graphics();
  for (const w of walls) if (!w.door) lines.moveTo(...w.a).lineTo(...w.b);
  return lines.stroke({ width: WALL_WIDTH, color: WALL_COLOR, cap: 'round' });
}
