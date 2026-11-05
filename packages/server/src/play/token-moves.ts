import {
  bodyOf,
  canControl,
  densify,
  type DoorState,
  isGm,
  isGridless,
  sceneLattice,
  type Player,
  type Point,
  sameFloor,
  walkPath,
  wallsOnFloor,
} from '@vtt/shared';
import { AnimationChoiceSchema, type ClientMessage, inTheWay, type Token } from '@vtt/system-dnd5e';
import type { CombatActions } from '../actions/combat-actions.ts';
import type { GameStore } from '../store/game-store.ts';
import type { Reactions } from './reactions.ts';
import { RegionActions } from '../actions/region-actions.ts';
import { Refusal, type Table } from './table.ts';
import { TriggerActions, type TriggerOut } from '../actions/trigger-actions.ts';
import type { Zones } from './zones.ts';

/** How far a path search may wander past the start-goal box, in squares. */
const PATH_MARGIN = 12;

/** What a walk sets off: the fight's movement, lasting zones, reactions and regions. */
export interface MoveRules {
  combat: CombatActions;
  zones: Zones;
  reactions: Reactions;
  regions: RegionActions;
  triggers: TriggerActions;
}

/** The walking rules with the regions and tile triggers of the scene: what `out` gets is what they say and play. */
export function tokenMoves(table: Table, rules: Omit<MoveRules, 'regions' | 'triggers'>, out: TriggerOut): TokenMoves {
  const triggers = new TriggerActions(table, out);
  return new TokenMoves(table.store, { ...rules, regions: new RegionActions(table, triggers), triggers });
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
  move(player: Player, seen: (id: string) => boolean, { token: id, to, throughWalls }: Move): void {
    const token = this.controlled(player, seen, id);
    if (throughWalls && isGm(player)) return this.straight(token, to);
    const g = this.store.world.gridSize;
    const m = PATH_MARGIN * g;
    const around = this.store.wallsIn({
      x: Math.min(token.x, to[0]) - m,
      y: Math.min(token.y, to[1]) - m,
      w: Math.abs(token.x - to[0]) + 2 * m,
      h: Math.abs(token.y - to[1]) + 2 * m,
    });
    const walls = wallsOnFloor(around, this.store.world.levels, token);
    const { combat, zones, reactions, regions } = this.rules;
    const path = walkPath([token.x, token.y], to, walls, {
      gridSize: g,
      gridless: isGridless(this.store.world),
      lattice: sceneLattice(this.store.world),
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

  /**
   * The GM's "ignore walls" mode: straight to `to`, through walls and
   * creatures, setting nothing off and spending no movement (to free a
   * creature stuck in a wall, or put one where it belongs).
   */
  private straight(token: Token, to: Point): void {
    if (token.x === to[0] && token.y === to[1]) return;
    this.store.setToken({ ...token, x: to[0], y: to[1] }, [
      [token.x, token.y],
      [to[0], to[1]],
    ]);
  }

  /** The creatures on `token`'s floor in its way that you know of. */
  private others(token: Token, seen: (id: string) => boolean): Token[] {
    const levels = this.store.world.levels;
    return inTheWay(
      token,
      [...this.store.tokens.values()].filter((t) => seen(t.id) && sameFloor(levels, token, t)),
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

  /** Opening a door, or clicking a tile with a trigger. */
  use(player: Player, seen: (id: string) => boolean, msg: Extract<ClientMessage, { t: 'door' | 'trigger' }>): void {
    if (msg.t === 'trigger') return this.rules.triggers.click(player, seen, msg);
    this.door(player, msg);
  }

  /** Takes a token you control to another level: one the elevator it stands in serves (the GM: any). */
  changeLevel(player: Player, seen: (id: string) => boolean, id: string, level: string): void {
    const token = this.controlled(player, seen, id);
    this.rules.regions.changeLevel(player, token, level);
  }

  private door(player: Player, msg: { chunk: string; wall: string; state: DoorState }): void {
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
type Move = Extract<ClientMessage, { t: 'move' }>;

/** The choices with `ref` set to `animation`, or dropped (back to the default); none left is undefined. */
function withAnimation(choices: Token['animations'], ref: string, animation: string | undefined): Token['animations'] {
  const { [ref]: _old, ...rest } = choices ?? {};
  const next = animation ? { ...rest, [ref]: animation } : rest;
  return Object.keys(next).length ? next : undefined;
}
