import {
  bodyOf,
  canControl,
  densify,
  gridKind,
  type DoorState,
  isGm,
  isGridless,
  sceneLattice,
  type Player,
  type Point,
  sameFloor,
  trailBehind,
  walkPath,
  wallsOnFloor,
} from '@vtt/shared';
import {
  AnimationChoiceSchema,
  barrierStops,
  type ClientMessage,
  dragCost,
  grapplesOn,
  inTheWay,
  type Token,
} from '@vtt/system-dnd5e';
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
  /** Refuses a walk a barrier stops (antilife shell). */
  barriers: (token: Token, path: readonly Point[]) => void;
  regions: RegionActions;
  triggers: TriggerActions;
}

/** The walking rules with the regions and tile triggers of the scene: what `out` gets is what they say and play. */
export function tokenMoves(
  table: Table,
  rules: Omit<MoveRules, 'regions' | 'triggers' | 'barriers'>,
  out: TriggerOut,
): TokenMoves {
  const triggers = new TriggerActions(table, out);
  const barriers = (token: Token, path: readonly Point[]) => checkBarriers(table, token, path);
  return new TokenMoves(table.store, { ...rules, barriers, regions: new RegionActions(table, triggers), triggers });
}

/** Refuses a walk into a barrier that holds the walker's kind back (antilife shell). */
function checkBarriers(table: Table, token: Token, path: readonly Point[]): void {
  const type = table.sheetOf(token)?.type;
  if (!type) return;
  const { world } = table.store;
  const others = [...table.store.tokens.values()];
  const bearer = barrierStops({ mover: token, type, path, others, gridSize: world.gridSize, grid: gridKind(world) });
  const effect = bearer?.effects?.find((e) => e.barrier);
  if (bearer && effect) throw new Refusal(`${effect.name} holds ${token.name} back from ${bearer.name}`);
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
  move(player: Player, seen: (id: string) => boolean, { token: id, to, throughWalls, elevation }: Move): void {
    const token = this.controlled(player, seen, id);
    const climb = this.climb(elevation);
    if (throughWalls && isGm(player)) return this.straight({ ...token, ...climb }, to);
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
    this.rules.barriers(token, path.points);
    const dragged = this.dragged(token);
    const walker = combat.move(token, path.feet * dragCost(token, dragged), isGm(player));
    this.store.setToken({ ...walker, x, y, ...climb }, path.points);
    // Zones, reactions and regions look at every step of the way.
    const steps = densify(path.points, g / 4);
    zones.moved(token.id, steps);
    reactions.moved(token, steps);
    regions.entered(token.id, steps);
    for (const d of dragged) this.drag(d, token, path.points);
  }

  /** The creatures `token` holds in a grapple, on its floor: they come along when it walks. */
  private dragged(token: Token): Token[] {
    const levels = this.store.world.levels;
    return [...this.store.tokens.values()].filter(
      (t) => sameFloor(levels, token, t) && grapplesOn(t).some((e) => e.source === token.id),
    );
  }

  /** Pulls a grappled creature along the grappler's walk, keeping the gap between them. */
  private drag(dragged: Token, grappler: Token, walk: readonly Point[]): void {
    const gap = Math.hypot(dragged.x - grappler.x, dragged.y - grappler.y);
    const trail = trailBehind(walk, gap);
    const [x, y] = trail.at(-1)!;
    const points: Point[] = [[dragged.x, dragged.y], ...trail];
    this.store.setToken({ ...this.store.tokens.get(dragged.id)!, x, y }, points);
    const steps = densify(points, this.store.world.gridSize / 4);
    this.rules.zones.moved(dragged.id, steps);
    this.rules.regions.entered(dragged.id, steps);
  }

  /** The height a walk ends at: what the 3D view says it climbed onto, on a 3D scene only. */
  private climb(elevation: number | undefined): { elevation?: number } {
    return elevation !== undefined && this.store.world.view === '3d' ? { elevation } : {};
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

  /** Answers a tile's question (Monk's dialog) with option `option`. */
  answer(player: Player, id: string, option: number): void {
    this.rules.triggers.answer(player, id, option);
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
