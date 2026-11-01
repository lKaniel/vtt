import {
  ambientLevel,
  canObserve,
  editionOf,
  exploredRasters,
  fogCell,
  isGm,
  rasterStroke,
  sensesOf,
  SIGHT_SQUARES,
  srdFor,
  visibilityPolygon,
  type FogEdit,
  type FogEye,
  type Player,
  type Point,
  type Token,
} from '@vtt/shared';
import type { GameStore } from './game-store.ts';
import { requireGm } from './table.ts';

// Who explores what: after anything that changes what a player's tokens
// see, the game asks the keeper to mark it explored. It works on the
// scene the store is told to read (see GameStore.inScene).

export class FogKeeper {
  /** What each player's fog was last worked out from, so it isn't worked out again for nothing. */
  private seen = new Map<string, string>();
  /** Bumped when a scene's walls or lights change. */
  private mapRev = new Map<string, number>();

  constructor(private store: GameStore) {}

  /** The current scene's fog cell size. */
  cell(): number {
    return fogCell(this.store.world.gridSize);
  }

  /** Whether the current scene keeps explored fog. */
  keeps(): boolean {
    const world = this.store.world;
    return world.vision && world.exploration !== false;
  }

  /** A scene's map changed: sight has to be worked out again. */
  mapChanged(scene: string): void {
    this.mapRev.set(scene, (this.mapRev.get(scene) ?? 0) + 1);
  }

  /** Marks what `player`'s tokens see on the current scene as explored. */
  explore(player: Player): void {
    if (isGm(player) || !this.keeps()) return;
    const store = this.store;
    const world = store.world;
    const eyes = [...store.tokens.values()].filter((t) => canObserve(t, player)).map((t) => this.eyeOf(t));
    if (!eyes.length) return;
    const lights = store.lights();
    const scene = store.currentScene;
    const key = `${scene}\u0000${player.id}`;
    const signature = JSON.stringify([eyes, world.darkness, lights, this.mapRev.get(scene) ?? 0]);
    if (this.seen.get(key) === signature) return;
    this.seen.set(key, signature);
    const polygon = (at: Point, r: number) =>
      visibilityPolygon(at, r, store.wallsIn({ x: at[0] - r, y: at[1] - r, w: 2 * r, h: 2 * r }));
    const ctx = {
      dark: ambientLevel(world.darkness) === 'dark',
      lights,
      polygon,
      sight: SIGHT_SQUARES * world.gridSize,
      gridSize: world.gridSize,
      cell: this.cell(),
    };
    this.store.fog.explore(scene, player.id, ctx.cell, exploredRasters(eyes, ctx));
  }

  /** GM: reveal, hide or reset fog on the current scene. */
  edit(player: Player, edit: FogEdit): void {
    requireGm(player);
    const scene = this.store.currentScene;
    const players = edit.players ?? this.store.world.players.filter((p) => !isGm(p)).map((p) => p.id);
    if (edit.op === 'reset') return this.store.fog.reset(scene, players, this.cell());
    const raster = rasterStroke(edit.path, edit.radius, this.cell());
    this.store.fog.paint(scene, players, this.cell(), { raster, reveal: edit.op === 'reveal' });
    // A hidden patch a token still sees is seen again on its next look, not now.
  }

  /** Everything `viewer` is told about fog on the current scene: their own, or (the GM) every player's. */
  snapshot(viewer: Player): { player: string; cell: number; blocks: Record<string, string> }[] {
    if (!this.keeps()) return [];
    const scene = this.store.currentScene;
    const cell = this.cell();
    const players = isGm(viewer) ? this.store.world.players.filter((p) => !isGm(p)) : [viewer];
    return players.map((p) => ({ player: p.id, cell, blocks: this.store.fog.map(scene, p.id, cell).encode().blocks }));
  }

  private eyeOf(token: Token): FogEye {
    const monster = token.monster ? srdFor(editionOf(token, this.store.world)).monsters.get(token.monster) : undefined;
    return { at: [token.x, token.y], senses: sensesOf(token, monster) };
  }
}
