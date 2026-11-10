import { type Attack, type Spell, type TokenView } from '@vtt/system-dnd5e';
import { gridKind, type Point, type Region, regionCost, type Wall, wallsOnFloor, type WorldInfo } from '@vtt/shared';
import type { Session } from '../session/session.ts';
import { t } from '../i18n/index.ts';
import { attackGoal, type CloseIn, closeIn, type CloseInScene, type RangeGoal, spellGoal } from './close-in.ts';
import { walkOptions } from './walking.ts';

// The table side of close-in.ts: before an attack or a cast goes to the
// server, the creature you act with walks into range if it must (a `move`
// sent first, so the server walks it by the usual rules, spending movement
// and setting off what the way sets off).

/** What walking into range needs of the session: the scene, the creatures and the fight, and a way to move. */
export interface RangeHost {
  readonly tokens: ReadonlyMap<string, TokenView>;
  readonly world?: WorldInfo;
  readonly chunks: ReadonlyMap<string, { walls: readonly Wall[] }>;
  readonly docs: { all(collection: string): unknown[] };
  readonly scene: string;
  readonly turns: { movementLeft(id: string): number };
  readonly requests: { move(token: string, to: Point): void };
  showError(message: string): void;
}

/** What the action is aimed at: an attack at a creature or a point, or a spell at creatures or a point. */
export type RangeAim =
  { attack: Attack; target?: string; point?: Point } | { spell: Spell; targets: readonly string[]; point?: Point };

/**
 * Walks `mover` into range of `aim` if it is out of it; false (with the
 * reason shown) when its movement left in the fight doesn't get it there.
 * When there's no way into range it does nothing and leaves the server to
 * say why the action can't go.
 */
export function walkInRange(s: RangeHost, mover: string, aim: RangeAim): boolean {
  const plan = rangePlan(s, mover, aim);
  if (plan?.kind === 'walk') s.requests.move(mover, plan.to);
  if (plan?.kind !== 'tooFar') return true;
  const name = s.tokens.get(mover)?.name ?? '';
  s.showError(t('walk.cantCloseIn', { name, feet: plan.feet, left: plan.budget }));
  return false;
}

/** The last plan worked out, for the hover preview, which asks again every frame. */
let last: { key: string; plan: CloseIn | undefined } | undefined;

/** Whether `mover` acts at `aim` from where it stands or walks first (close-in.ts); undefined when there's nothing to check. */
export function rangePlan(s: RangeHost, mover: string, aim: RangeAim): CloseIn | undefined {
  const token = s.tokens.get(mover);
  const key = token && JSON.stringify([s.scene, token.x, token.y, s.turns.movementLeft(mover), aimKey(s, aim)]);
  if (key && last?.key === key) return last.plan;
  const scene = token && closeInScene(s, token);
  const goal = scene && goalFor(s, aim, scene);
  const plan = token && scene && goal ? closeIn(token, goal, scene) : undefined;
  if (key) last = { key, plan };
  return plan;
}

/** What an aim is at, with where its creatures stand. */
function aimKey(s: RangeHost, aim: RangeAim): unknown[] {
  const at = (id: string | undefined) => id && [id, s.tokens.get(id)?.x, s.tokens.get(id)?.y];
  if ('attack' in aim) return [aim.attack.name, at(aim.target), aim.point];
  return [aim.spell.id, aim.targets.map(at), aim.point];
}

function goalFor(s: RangeHost, aim: RangeAim, scene: CloseInScene): RangeGoal | undefined {
  const placed = (id: string) => s.tokens.get(id);
  if ('attack' in aim) {
    const target = aim.target ? placed(aim.target) : aim.point && { x: aim.point[0], y: aim.point[1], size: 1 };
    return target ? attackGoal(aim.attack, target, scene) : undefined;
  }
  const targets = aim.targets.map(placed);
  if (targets.some((t) => !t)) return undefined;
  return spellGoal(aim.spell, { targets: targets as TokenView[], point: aim.point }, scene);
}

/** The walls of the mover's floor, how it walks round what the player knows of, difficult ground and its movement left. */
function closeInScene(s: RangeHost, token: TokenView): CloseInScene | undefined {
  const world = s.world;
  if (!world) return undefined;
  const regions = s.docs.all(`${s.scene}/regions`) as Region[];
  const walls = [...s.chunks.values()].flatMap((c) => c.walls);
  return {
    gridSize: world.gridSize,
    grid: gridKind(world),
    walls: wallsOnFloor(walls, world.levels, token),
    walk: walkOptions(world, token, s.tokens.values()),
    cost: regionCost(regions, world.darkness),
    budget: s.turns.movementLeft(token.id),
  };
}

/** What the action ready would be aimed at with the pointer at `at` (snapped to `snapId`'s creature, if any). */
export function hoverAim(s: Session, mover: TokenView, at: Point, snapId?: string): RangeAim | undefined {
  const { aiming, armed } = s.actions;
  const attack = mover.sheet?.attacks.find((a) => a.name === armed);
  if (attack) return snapId ? { attack, target: snapId } : { attack, point: at };
  if (!aiming || aiming.mode === 'self' || aiming.repeat) return undefined;
  if (aiming.mode === 'creatures' && snapId) return { spell: aiming.spell, targets: [...aiming.picks, snapId] };
  return { spell: aiming.spell, targets: aiming.mode === 'creatures' ? aiming.picks : [], point: at };
}
