import { canControl, type DoorState, findPath, isGm, type Player, type Point } from '@vtt/shared';
import type { CombatActions } from './combat-actions.ts';
import type { GameStore } from './game-store.ts';
import type { Reactions } from './reactions.ts';
import type { RegionActions } from './region-actions.ts';
import { Refusal } from './table.ts';
import type { Zones } from './zones.ts';

/** How far a path search may wander past the start-goal box, in squares. */
const PATH_MARGIN = 12;

/** Walking tokens, opening doors and arranging action bars, on the scene the store is told to read. */
/** What a walk sets off: the fight's movement, lasting zones, reactions and regions. */
export interface MoveRules {
  combat: CombatActions;
  zones: Zones;
  reactions: Reactions;
  regions: RegionActions;
}

export class TokenMoves {
  constructor(
    private store: GameStore,
    private rules: MoveRules,
  ) {}

  /** Walks a token you control along the shortest way there; `seen` is what you know of. */
  move(player: Player, seen: (id: string) => boolean, id: string, to: Point): void {
    const token = this.controlled(player, seen, id);
    const g = this.store.world.gridSize;
    const m = PATH_MARGIN * g;
    const walls = this.store.wallsIn({
      x: Math.min(token.x, to[0]) - m,
      y: Math.min(token.y, to[1]) - m,
      w: Math.abs(token.x - to[0]) + 2 * m,
      h: Math.abs(token.y - to[1]) + 2 * m,
    });
    const { combat, zones, reactions, regions } = this.rules;
    const path = findPath([token.x, token.y], to, walls, { gridSize: g, margin: PATH_MARGIN, cost: regions.cost() });
    if (!path) throw new Refusal(`${token.name} can't get there`);
    const [x, y] = path.points.at(-1)!;
    if (path.points.length < 2) return;
    const walker = combat.move(token, path.feet);
    this.store.setToken({ ...walker, x, y }, path.points);
    zones.moved(token.id, path.points);
    reactions.moved(token, path.points);
    regions.entered(token.id, path.points);
  }

  hotbar(player: Player, seen: (id: string) => boolean, id: string, slots: (string | null)[]): void {
    const token = this.controlled(player, seen, id);
    this.store.setToken({ ...token, hotbar: slots });
  }

  door(player: Player, msg: { chunk: string; wall: string; state: DoorState }): void {
    const chunk = this.store.chunks.get(msg.chunk);
    const wall = chunk?.walls.find((w) => w.id === msg.wall);
    if (!chunk || !wall?.door) throw new Refusal('No such door');
    if (player.role === 'observer') throw new Refusal('Observers only watch');
    const touchesLock = wall.door === 'locked' || msg.state === 'locked';
    if (touchesLock && !isGm(player)) throw new Refusal('The door is locked');
    const walls = chunk.walls.map((w) => (w === wall ? { ...w, door: msg.state } : w));
    this.store.setChunk(msg.chunk, { ...chunk, walls });
  }

  private controlled(player: Player, seen: (id: string) => boolean, id: string) {
    const token = this.store.tokens.get(id);
    if (!token || !seen(token.id)) throw new Refusal('No such token');
    if (!canControl(token, player)) throw new Refusal(`You don't control ${token.name}`);
    return token;
  }
}
