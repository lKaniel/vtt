import {
  bodyOf,
  canControl,
  densify,
  type DoorState,
  isGm,
  isGridless,
  type Player,
  type Point,
  walkPath,
  wallsAt,
} from '@vtt/shared';
import { AnimationChoiceSchema, type ClientMessage, inTheWay, type Token } from '@vtt/system-dnd5e';
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

  /**
   * Walks a token you control along the shortest way there, around walls and
   * the creatures you know of (`seen`): to the exact point without a grid,
   * square to square on one.
   */
  move(player: Player, seen: (id: string) => boolean, id: string, to: Point): void {
    const token = this.controlled(player, seen, id);
    const g = this.store.world.gridSize;
    const m = PATH_MARGIN * g;
    const around = this.store.wallsIn({
      x: Math.min(token.x, to[0]) - m,
      y: Math.min(token.y, to[1]) - m,
      w: Math.abs(token.x - to[0]) + 2 * m,
      h: Math.abs(token.y - to[1]) + 2 * m,
    });
    const walls = wallsAt(around, token.elevation);
    const { combat, zones, reactions, regions } = this.rules;
    const path = walkPath([token.x, token.y], to, walls, {
      gridSize: g,
      gridless: isGridless(this.store.world),
      radius: bodyOf(token, g).r,
      bodies: this.others(token, seen).map((t) => bodyOf(t, g)),
      margin: PATH_MARGIN,
      cost: regions.cost(),
    });
    if (!path) throw new Refusal(`${token.name} can't get there`);
    const [x, y] = path.points.at(-1)!;
    if (path.points.length < 2) return;
    const walker = combat.move(token, path.feet);
    this.store.setToken({ ...walker, x, y }, path.points);
    // Zones, reactions and regions look at every step of the way.
    const steps = densify(path.points, g / 4);
    zones.moved(token.id, steps);
    reactions.moved(token, steps);
    regions.entered(token.id, steps);
  }

  /** The creatures in `token`'s way that you know of. */
  private others(token: Token, seen: (id: string) => boolean): Token[] {
    return inTheWay(
      token,
      [...this.store.tokens.values()].filter((t) => seen(t.id)),
    );
  }

  /** A controller arranges their creature: its action bar, or the animation of one attack or spell. */
  arrange(player: Player, seen: (id: string) => boolean, msg: Arrange): void {
    const token = this.controlled(player, seen, msg.token);
    if (msg.t === 'hotbar') return this.store.setToken({ ...token, hotbar: msg.slots });
    if (msg.animation && !AnimationChoiceSchema.safeParse(msg.animation).success) {
      throw new Refusal(`No animation "${msg.animation}"`);
    }
    this.store.setToken({ ...token, animations: withAnimation(token.animations, msg.ref, msg.animation) });
  }

  door(player: Player, msg: { chunk: string; wall: string; state: DoorState }): void {
    const chunk = this.store.chunks.get(msg.chunk);
    const wall = chunk?.walls.find((w) => w.id === msg.wall);
    if (!chunk || !wall?.door || (wall.secret && !isGm(player))) throw new Refusal('No such door');
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

type Arrange = Extract<ClientMessage, { t: 'hotbar' | 'animation' }>;

/** The choices with `ref` set to `animation`, or dropped (back to the default); none left is undefined. */
function withAnimation(choices: Token['animations'], ref: string, animation: string | undefined): Token['animations'] {
  const { [ref]: _old, ...rest } = choices ?? {};
  const next = animation ? { ...rest, [ref]: animation } : rest;
  return Object.keys(next).length ? next : undefined;
}
