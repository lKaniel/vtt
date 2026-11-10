import { type Attack, attackRange, type Spell, tokenDistance } from '@vtt/system-dnd5e';
import {
  type Body,
  bodyOf,
  densify,
  type GridKind,
  hasLineOfSight,
  type Point,
  snapToCell,
  type WalkOptions,
  walkPath,
  type Wall,
} from '@vtt/shared';

// Walking into range before an attack or a cast, as in BG3: a creature that
// can't reach its target from where it stands walks along its way there and
// stops at the first spot it can strike or cast from, if its movement left
// in the fight gets it there.

/** A creature or a point on the map: where it stands and how many squares across it is. */
export interface Placed {
  x: number;
  y: number;
  size: number;
}

/** What the walk is measured against: the mover's floor's walls, how it walks and the movement it has left. */
export interface CloseInScene {
  gridSize: number;
  grid: GridKind;
  walls: readonly Wall[];
  walk: WalkOptions;
  /** What a step through each point costs (difficult ground). */
  cost?: (p: Point) => number;
  /** Feet of movement left (Infinity out of a fight). */
  budget: number;
}

/** What an action needs: whether it can go off from a spot (`best`: without disadvantage), and what to walk towards. */
export interface RangeGoal {
  reaches(at: Point, size: number, best: boolean): boolean;
  /** Where to head for, given the mover's body. */
  toward(mover: Body): Point;
  /** The creatures aimed at: the way may head into them, as the walk stops once they are in reach. */
  through?: readonly Placed[];
}

/** Whether to walk first, and where to. */
export type CloseIn =
  | { kind: 'here' }
  | { kind: 'walk'; to: Point; feet: number; points: readonly Point[] }
  | { kind: 'unreachable' }
  | { kind: 'tooFar'; feet: number; budget: number };

const HERE: CloseIn = { kind: 'here' };
const UNREACHABLE: CloseIn = { kind: 'unreachable' };

/** Whether `mover` acts from where it stands, or walks first to the first spot along its way that reaches the goal. */
export function closeIn(mover: Placed, goal: RangeGoal, scene: CloseInScene): CloseIn {
  const from: Point = [mover.x, mover.y];
  if (goal.reaches(from, mover.size, false)) return HERE;
  const opts = { ...scene.walk, cost: scene.cost };
  const aimed = (b: Body) => goal.through?.some((t) => t.x === b.x && t.y === b.y);
  const heading = { ...opts, bodies: opts.bodies.filter((b) => !aimed(b)) };
  const path = walkPath(from, goal.toward(bodyOf(mover, scene.gridSize)), scene.walls, heading);
  const stop = path && firstSpot(path.points, mover.size, goal, scene);
  const way = stop && walkPath(from, stop, scene.walls, opts);
  if (!stop || !way) return UNREACHABLE;
  if (way.feet > scene.budget) return { kind: 'tooFar', feet: way.feet, budget: scene.budget };
  return { kind: 'walk', to: stop, feet: way.feet, points: way.points };
}

/** The first spot along `points` the goal is reached from at its best, else at all; on a grid, square centres. */
function firstSpot(points: readonly Point[], size: number, goal: RangeGoal, scene: CloseInScene): Point | undefined {
  const lattice = scene.walk.gridless ? undefined : scene.walk.lattice;
  const steps = densify(points, scene.gridSize / 10)
    .slice(1)
    .map((p) => (lattice ? snapToCell(p, lattice) : p));
  return steps.find((p) => goal.reaches(p, size, true)) ?? steps.find((p) => goal.reaches(p, size, false));
}

type Sight = Pick<CloseInScene, 'gridSize' | 'grid' | 'walls'>;

const clear = (scene: Sight, from: Point, to: Point) =>
  hasLineOfSight(from, to, scene.walls, { kind: 'sight', gridSize: scene.gridSize });

/** An attack at a creature or at a point on the ground (a point is one square across): in range and in clear sight. */
export function attackGoal(attack: Attack, target: Placed, scene: Sight): RangeGoal {
  return {
    reaches: (at, size, best) => {
      const feet = tokenDistance({ x: at[0], y: at[1], size }, target, scene.gridSize, scene.grid);
      const range = attackRange(attack, feet);
      return (best ? range === 'normal' : range !== 'out') && clear(scene, at, [target.x, target.y]);
    },
    toward: () => [target.x, target.y],
    through: [target],
  };
}

/** A spell at creatures (every one in range and sight) or at a point; self areas and teleports never walk. */
export function spellGoal(spell: Spell, aim: { targets?: Placed[]; point?: Point }, scene: Sight): RangeGoal {
  const targets = aim.targets ?? [];
  const last = targets.at(-1);
  if (last) {
    const reach = Math.max(5, spell.range);
    const reaches = (at: Point, size: number) =>
      targets.every(
        (t) =>
          tokenDistance({ x: at[0], y: at[1], size }, t, scene.gridSize, scene.grid) <= reach &&
          clear(scene, at, [t.x, t.y]),
      );
    return { reaches, toward: () => [last.x, last.y], through: targets };
  }
  const point = aim.point;
  if (!point || spell.teleport || spell.range <= 0) return { reaches: () => true, toward: (m) => [m.x, m.y] };
  const reaches = (at: Point) =>
    (Math.hypot(point[0] - at[0], point[1] - at[1]) / scene.gridSize) * 5 <= spell.range + 2.5 &&
    clear(scene, at, point);
  return { reaches, toward: () => point };
}
