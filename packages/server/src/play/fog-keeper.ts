import {
  ambientLevel,
  canObserve,
  exploredRasters,
  fogCell,
  type FogEdit,
  type FogEye,
  fogFloor,
  isGm,
  type LightSource,
  onLevel,
  type Player,
  rasterStroke,
  type ReachPolygon,
  SIGHT_SQUARES,
  tokenLevel,
  visibilityPolygon,
  wallsAt,
} from '@vtt/shared';
import type { Token } from '@vtt/system-dnd5e';
import { fogPlace, placeOf } from '../store/fog-store.ts';
import type { GameStore } from '../store/game-store.ts';
import { requireGm } from './table.ts';
import { packContent } from '../library/game-packs.ts';

type LevelEye = FogEye & { level: string | undefined };

/** Eyes grouped by the level they look out on. */
function byLevel(eyes: readonly LevelEye[]): Map<string | undefined, LevelEye[]> {
  const out = new Map<string | undefined, LevelEye[]>();
  for (const e of eyes) out.set(e.level, [...(out.get(e.level) ?? []), e]);
  return out;
}

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
    const eyes = [...store.tokens.values()].filter((t) => canObserve(t, player)).map((t) => this.eyeOf(t));
    if (!eyes.length) return;
    const lights = store.lights();
    const scene = store.currentScene;
    const key = `${scene}\u0000${player.id}`;
    const signature = JSON.stringify([eyes, store.world.darkness, lights, this.mapRev.get(scene) ?? 0]);
    if (this.seen.get(key) === signature) return;
    this.seen.set(key, signature);
    for (const [level, group] of byLevel(eyes)) {
      const rasters = exploredRasters(group, this.sightOn(level, lights));
      this.store.fog.explore(this.placeOn(level), player.id, this.cell(), rasters);
    }
  }

  /** Where fog seen from `level` of the current scene is kept: each floor has its own. */
  placeOn(level: string | undefined): string {
    return fogPlace(this.store.currentScene, fogFloor(this.store.world.levels, level));
  }

  /** How far and past what eyes on `level` see: its walls and lights, and those on every level. */
  private sightOn(level: string | undefined, lights: readonly LightSource[]) {
    const store = this.store;
    const world = store.world;
    const polygon: ReachPolygon = (at, r, kind = 'sight', elevation) => {
      const walls = store.wallsIn({ x: at[0] - r, y: at[1] - r, w: 2 * r, h: 2 * r });
      const here = wallsAt(walls, elevation).filter((w) => onLevel(w, level));
      return visibilityPolygon(at, r, here, { kind, gridSize: world.gridSize });
    };
    return {
      dark: ambientLevel(world.darkness) === 'dark',
      lights: lights.filter((l) => onLevel(l, level)),
      polygon,
      sight: SIGHT_SQUARES * world.gridSize,
      gridSize: world.gridSize,
      cell: this.cell(),
    };
  }

  /** GM: reveal, hide or reset fog on the current scene: on the floor named, else (a reset) every floor. */
  edit(player: Player, edit: FogEdit): void {
    requireGm(player);
    const fog = this.store.fog;
    const players = edit.players ?? this.store.world.players.filter((p) => !isGm(p)).map((p) => p.id);
    if (edit.op === 'reset') {
      const places = edit.level ? [this.placeOn(edit.level)] : fog.placesOf(this.store.currentScene);
      for (const place of places) fog.reset(place, players, this.cell());
      return;
    }
    const raster = rasterStroke(edit.path, edit.radius, this.cell());
    fog.paint(this.placeOn(edit.level), players, this.cell(), { raster, reveal: edit.op === 'reveal' });
    // A hidden patch a token still sees is seen again on its next look, not now.
  }

  /** Everything `viewer` is told about fog on the current scene, floor by floor: their own, or (the GM) every player's. */
  snapshot(viewer: Player): { player: string; level?: string; cell: number; blocks: Record<string, string> }[] {
    if (!this.keeps()) return [];
    const fog = this.store.fog;
    const cell = this.cell();
    const players = isGm(viewer) ? this.store.world.players.filter((p) => !isGm(p)) : [viewer];
    return fog.placesOf(this.store.currentScene).flatMap((place) => {
      const { level } = placeOf(place);
      return players.map((p) => ({
        player: p.id,
        ...(level && { level }),
        cell,
        blocks: fog.map(place, p.id, cell).encode().blocks,
      }));
    });
  }

  private eyeOf(token: Token): LevelEye {
    const levels = this.store.world.levels;
    return {
      at: [token.x, token.y],
      ...(token.elevation !== undefined && { elevation: token.elevation }),
      level: levels?.length ? tokenLevel(levels, token) : undefined,
      senses: this.store.system.perceiver(token, this.store.world.rules, packContent(this.store)).senses,
    };
  }
}
