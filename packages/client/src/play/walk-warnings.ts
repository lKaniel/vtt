import {
  costFeet,
  densify,
  type GridKind,
  type Point,
  type Region,
  regionCost,
  regionsEntered,
  regionWorks,
} from '@vtt/shared';
import { type Combat, meleeReach, threatsAlong, type TokenView } from '@vtt/system-dnd5e';

// What a walk the player is about to make would set off, shown along the
// path before they click (as in BG3): enemies that get an opportunity attack,
// where the movement left runs out, difficult ground and traps they know of.

export type WalkWarning =
  | { kind: 'opportunity'; name: string; at: Point; from: Point }
  /** `reach`: the part of the way the movement left covers, ending at `at`. */
  | { kind: 'tooFar'; at: Point; reach: Point[] }
  | { kind: 'difficult'; at: Point }
  | { kind: 'trap'; name: string; at: Point };

export interface WalkPlan {
  mover: TokenView;
  /** The way, as walkPath gives it. */
  path: readonly Point[];
  gridSize: number;
  grid: GridKind;
  /** The creatures this player knows of. */
  tokens: Iterable<TokenView>;
  /** The regions this player knows of. */
  regions: readonly Region[];
  darkness?: number;
  combat: Combat | null;
  /** Feet of movement left (Infinity outside a fight). */
  budget: number;
}

/** Everything worth a warning along `plan.path`, in the order met. */
export function walkWarnings(plan: WalkPlan): WalkWarning[] {
  const steps = densify(plan.path, plan.gridSize / 4);
  const working = plan.regions.filter((r) => regionWorks(r, plan.darkness ?? 0));
  return [
    ...opportunities(plan, steps),
    ...runsOut(plan, steps, working),
    ...difficult(steps, working),
    ...traps(steps, working),
  ];
}

/** Enemies whose reach the walk leaves, in a fight: their reach if you know their sheet, else 5 ft. */
function opportunities(plan: WalkPlan, path: Point[]): WalkWarning[] {
  const { combat, mover } = plan;
  if (!combat) return [];
  const foes = [...plan.tokens].filter(
    (t) => t.id !== mover.id && !t.pile && t.health !== 'down' && t.hp !== 0 && !combat.reacted.includes(t.id),
  );
  const threats = foes.map((token) => ({ token, reach: token.sheet ? meleeReach(token.sheet) : 5 }));
  return threatsAlong({ mover, path, threats, gridSize: plan.gridSize, grid: plan.grid }).map((t) => {
    const foe = foes.find((f) => f.id === t.id)!;
    return { kind: 'opportunity', name: foe.name, at: t.at, from: [foe.x, foe.y] };
  });
}

/** Where the movement left runs out, when the walk is longer. */
function runsOut(plan: WalkPlan, path: Point[], regions: readonly Region[]): WalkWarning[] {
  if (!Number.isFinite(plan.budget)) return [];
  const cost = regionCost(regions, plan.darkness ?? 0);
  let feet = 0;
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1]!, path[i]!];
    const step = costFeet([a, b], plan.gridSize, cost);
    if (feet + step > plan.budget + 1e-6) {
      const t = (plan.budget - feet) / step;
      const at: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      return [{ kind: 'tooFar', at, reach: [...path.slice(0, i), at] }];
    }
    feet += step;
  }
  return [];
}

function difficult(path: Point[], regions: readonly Region[]): WalkWarning[] {
  const slow = regions.filter((r) => r.behaviors.some((b) => b.type === 'difficult'));
  const cost = regionCost(slow, 0);
  const at = path.find((p) => cost(p) > 1);
  return at ? [{ kind: 'difficult', at }] : [];
}

function traps(path: Point[], regions: readonly Region[]): WalkWarning[] {
  const trapped = regions.filter((r) => r.behaviors.some((b) => b.type === 'trap'));
  return regionsEntered(trapped, path).map(({ region, at }) => ({
    kind: 'trap',
    name: region.name ?? '',
    at: path[at]!,
  }));
}
