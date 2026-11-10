import type { TileTrigger, TriggerAction, TriggerTarget } from '@vtt/shared';
import type { FoundryDoc } from './foundry-db.ts';
import { doorWallFor } from './foundry-doors3d.ts';
import {
  type ActionContext,
  type Entity,
  entityOf,
  type Target,
  targets,
  type TriggerLookups,
} from './foundry-monks-index.ts';

export { SceneIndex, type TriggerLookups } from './foundry-monks-index.ts';
import { choiceOf, type MonkAction, pathOf, plain, segmentsOf, upToChoice } from './foundry-monks-flow.ts';
import { journalOf, moveOf, nearOf, rotationOf, sceneViewOf } from './foundry-monks-more.ts';

// Monk's Active Tiles as our tile triggers (trigger-schema.ts in shared):
// what a tile does when it is clicked or walked onto. Its actions point at
// things by Tagger tag, Foundry id or "this tile"; the scene's index finds
// ours. Monk's jumps (anchors, goto) become the one path a click most
// likely takes, and a dialog with buttons a choice whose answers run their
// own paths (foundry-monks-flow.ts). A change of the creature's elevation
// becomes a ladder between floors. What has no match (macros, other alters,
// animations) is reported.

const SEEN = ['tiles', 'tokens', 'regions', 'drawings', 'notes', 'sounds', 'lights'] as const;
const seen = (t: Target): t is TriggerTarget => (SEEN as readonly string[]).includes(t.coll);

/** Monk's "activate" on a light or sound: lit (shown) or put out (hidden). */
const LIT: Record<string, 'show' | 'hide'> = { activate: 'show', deactivate: 'hide' };

const HIDE: Record<string, 'show' | 'hide' | 'toggle'> = { show: 'show', hide: 'hide', toggle: 'toggle' };

function imageAction(a: MonkAction, c: ActionContext): TriggerAction[] {
  return targets(entityOf(a.data), c, ['tiles']).flatMap((t) => {
    const images = c.imagesOf(t.id);
    return images.length ? [{ type: 'image' as const, ...(t.id === c.self ? {} : { tile: t.id }), images }] : [];
  });
}

function showHide(a: MonkAction, c: ActionContext): TriggerAction[] {
  const to = HIDE[String(a.data?.hidden)] ?? 'toggle';
  return targets(entityOf(a.data), c)
    .filter(seen)
    .map((target) => ({ type: 'visibility' as const, target, to }));
}

/** Monk's "activate": a tile's trigger or a region on or off; a light or sound lit or put out. */
function activate(a: MonkAction, c: ActionContext): TriggerAction[] {
  const how = String(a.data?.activate);
  const on = { activate: 'on', deactivate: 'off' }[how] as 'on' | 'off' | undefined;
  return targets(entityOf(a.data), c).flatMap((t): TriggerAction[] => {
    if (t.coll === 'tiles' || t.coll === 'regions')
      return [{ type: 'activate', target: { coll: t.coll, id: t.id }, to: on ?? 'toggle' }];
    if (t.coll === 'lights' || t.coll === 'sounds')
      return [{ type: 'visibility', target: { coll: t.coll, id: t.id }, to: LIT[how] ?? 'toggle' }];
    return [];
  });
}

function sound(a: MonkAction, c: ActionContext): TriggerAction[] {
  const file = typeof a.data?.audiofile === 'string' ? a.data.audiofile : '';
  const src = file.includes('*') ? c.glob(file)[0] : file && c.media(file);
  const volume = typeof a.data?.volume === 'number' ? Math.min(1, Math.max(0, a.data.volume)) : undefined;
  return src ? [{ type: 'sound', src, ...(volume === undefined ? {} : { volume }) }] : [];
}

function teleport(a: MonkAction, c: ActionContext): TriggerAction[] {
  const at = (a.data?.location ?? {}) as { x?: unknown; y?: unknown; sceneId?: unknown };
  if (typeof at.x !== 'number' || typeof at.y !== 'number') return [];
  const scene = typeof at.sceneId === 'string' ? c.scene(at.sceneId) : undefined;
  return [{ type: 'teleport', to: [Math.round(at.x), Math.round(at.y)], ...(scene ? { scene } : {}) }];
}

/** "={{entity.data.elevation}} == 0 ? 10 : 0" and the like: a ladder between the two elevations. */
const TOGGLE = /\?\s*(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)\s*$/;
const ABSOLUTE = /^=?\s*(-?\d+(?:\.\d+)?)$/;

/** "+ 22.5", "- 22": a step up or down from where it is ("-10", with no space, is a height). */
const RELATIVE = /^(\+|-(?=\s))\s*(\d+(?:\.\d+)?)$/;

type HeightChange = { to: number } | { by: number };

const valueOf = (raw: unknown) => (typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '');

/** The step a relative value takes, up (+) or down; undefined for a height or a formula. */
function stepOf(value: string): number | undefined {
  const m = RELATIVE.exec(value);
  if (!m) return undefined;
  return m[1] === '+' ? Number(m[2]) : -Number(m[2]);
}

/** A step from where it is, or a height to go to; undefined for anything else (a formula). */
function heightChange(value: string): HeightChange | undefined {
  const by = stepOf(value);
  if (by !== undefined) return { by };
  const at = ABSOLUTE.exec(value);
  return at ? { to: Number(at[1]) } : undefined;
}

/** Raises or lowers the creature that set it off ("token"), or the tiles and creatures named (a lift). */
function raiseOf(entity: Entity, c: ActionContext, change: HeightChange | undefined): TriggerAction[] {
  if (!change) return [];
  if (entity === 'token') return [{ type: 'elevation', ...change }];
  return targets(entity, c, ['tiles', 'tokens']).map((t) => ({
    type: 'elevation' as const,
    target: { coll: t.coll as 'tiles' | 'tokens', id: t.id },
    ...change,
  }));
}

/** Monk's "elevation": the creature or the tagged tiles (a lift) up, down or to a height. */
function elevation(a: MonkAction, c: ActionContext): TriggerAction[] {
  return raiseOf(entityOf(a.data), c, heightChange(valueOf(a.data?.value)));
}

/** Monk's "alter" of x or y by a step: a sliding door, tile or creature. */
function shiftOf(a: MonkAction, c: ActionContext, axis: 'x' | 'y'): TriggerAction[] {
  const d = stepOf(valueOf(a.data?.value));
  if (d === undefined) return [];
  const by: [number, number] = axis === 'x' ? [d, 0] : [0, d];
  return targets(entityOf(a.data), c, ['tiles', 'tokens']).map((t) => ({
    type: 'shift' as const,
    target: { coll: t.coll as 'tiles' | 'tokens', id: t.id },
    by,
  }));
}

/**
 * Monk's "alter": x or y slides it; the creature's elevation takes it to a
 * floor, or both ways between two (a ladder), on a scene with floors, and
 * up or down (or to a height) elsewhere. Other changes have no match.
 */
function alter(a: MonkAction, c: ActionContext): TriggerAction[] {
  const attribute = a.data?.attribute;
  if (attribute === 'x' || attribute === 'y') return shiftOf(a, c, attribute);
  if (attribute === DOOR_STATE) return modelDoor(a, c);
  if (attribute !== 'elevation') return [];
  const value = valueOf(a.data?.value);
  if (!c.floorAt || RELATIVE.test(value)) return raiseOf(entityOf(a.data) ?? 'token', c, heightChange(value));
  return floorChange(value, c.floorAt);
}

/** A height that names a floor: a ladder to it, or both ways between two. */
function floorChange(value: string, floorAt: (feet: number) => string | undefined): TriggerAction[] {
  const toggle = TOGGLE.exec(value);
  if (toggle) {
    const [one, other] = [floorAt(Number(toggle[1])), floorAt(Number(toggle[2]))];
    return one && other && one !== other ? [{ type: 'stairs', between: [one, other] }] : [];
  }
  const at = ABSOLUTE.exec(value);
  const to = at ? floorAt(Number(at[1])) : undefined;
  return to ? [{ type: 'level', to }] : [];
}

const FLOOR_CHANGES = new Set<TriggerAction['type']>(['level', 'stairs']);

/** A change of floor or height for the creature that set it off. */
const ownHeight = (a: TriggerAction) => FLOOR_CHANGES.has(a.type) || (a.type === 'elevation' && !a.target);

/** The creature's floor and height changes go first: a teleport ends the actions after it, and it changes where it stands. */
const floorsFirst = (actions: TriggerAction[]) => [
  ...actions.filter(ownHeight),
  ...actions.filter((a) => !ownHeight(a)),
];

/** 3D Canvas keeps a door model's state (0 shut, 1 open, 2 locked) in this flag. */
const DOOR_STATE = 'flags.levels-3d-preview.doorState';
const ALTERED = new Set(['elevation', 'x', 'y', DOOR_STATE]);

/** Opens or shuts the door walls 3D Canvas door models (a drawbridge, a trapdoor) move with. */
function modelDoor(a: MonkAction, c: ActionContext): TriggerAction[] {
  const to = DOOR_STATES[Number(valueOf(a.data?.value))];
  if (!to) return [];
  return targets(entityOf(a.data), c, ['tiles']).flatMap((t) => {
    const wall = doorWallFor(c.index.rawOf(t));
    return wall ? [{ type: 'door' as const, wall, to }] : [];
  });
}

const DOOR_STATES = ['closed', 'open', 'locked'] as const;

/** Monk's actions with no match here: unknown ones, and alters of anything but elevation and place. */
const unmatched = (a: MonkAction, c: ActionContext) => {
  if (a.action === 'alter') return !ALTERED.has(String(a.data?.attribute));
  if (a.action === 'distance') return nearOf([a], c.gridSize) === null;
  if (a.action && MAYBE.has(a.action)) return !ACTIONS[a.action]!(a, c).length;
  return !ACTIONS[a.action ?? ''] && !QUIET.has(a.action ?? '');
};

/** Monk's actions that have a match only for some of their settings. */
const MAYBE = new Set(['dialog', 'rotation', 'movetoken', 'scene', 'openjournal']);

const DOOR: Record<string, 'open' | 'closed' | 'locked' | 'toggle'> = {
  open: 'open',
  closed: 'closed',
  close: 'closed',
  locked: 'locked',
  lock: 'locked',
  toggle: 'toggle',
};

function door(a: MonkAction, c: ActionContext): TriggerAction[] {
  const to = DOOR[String(a.data?.state).toLowerCase()];
  if (!to) return [];
  return targets(entityOf(a.data), c, ['walls']).map((w) => ({ type: 'door' as const, wall: w.id, to }));
}

/** A dialog that only tells the GM something (a note on how the map works), as a word to the GM. */
function gmNote(a: MonkAction): TriggerAction[] {
  const d = a.data ?? {};
  const forGm = d.for === 'gm' || d.showto === 'gm';
  const buttons = Array.isArray(d.buttons) ? d.buttons.length : 0;
  const text = plain(d.content);
  return forGm && !buttons && d.dialogtype !== 'confirm' && text ? [{ type: 'message', text, gmOnly: true }] : [];
}

function message(a: MonkAction): TriggerAction[] {
  const text = plain(a.data?.text);
  return text ? [{ type: 'message', text, ...(a.data?.showto === 'gm' ? { gmOnly: true } : {}) }] : [];
}

/** Our actions for one Monk's action; undefined: no match. */
const ACTIONS: Record<string, (a: MonkAction, c: ActionContext) => TriggerAction[]> = {
  tileimage: imageAction,
  imagecycle: imageAction,
  showhide: showHide,
  activate,
  playsound: sound,
  teleport,
  changedoor: door,
  alter,
  elevation,
  notification: message,
  chatmessage: message,
  dialog: (a, c) => [...gmNote(a), ...choiceOf(a, c.segments, (b) => convert(b, c))],
  rotation: rotationOf,
  movetoken: moveOf,
  scene: sceneViewOf,
  openjournal: journalOf,
};

/** Our actions for one Monk's action (none: no match). */
const convert = (a: MonkAction, c: ActionContext): TriggerAction[] => ACTIONS[a.action ?? '']?.(a, c) ?? [];

/** Monk's actions that change nothing on their own (timing, labels). */
const QUIET = new Set(['delay', 'anchor', 'stop', 'goto']);

/** When Monk's runs it: walked onto, else clicked (right-click and "manual" ones: by the GM). */
function onOf(trigger: unknown): { on: 'click' | 'enter'; gmOnly?: true } | undefined {
  const all = (Array.isArray(trigger) ? trigger : [trigger]).map(String);
  // Moving within the tile and stopping on it go off as walking onto it does.
  if (all.some((t) => t === 'enter' || t === 'movement' || t === 'stop')) return { on: 'enter' };
  if (all.some((t) => t === 'click' || t === 'dblclick' || t === 'both')) return { on: 'click' };
  if (all.some((t) => t === 'rightclick' || t === 'dblrightclick' || t === 'manual'))
    return { on: 'click', gmOnly: true };
  return undefined;
}

interface MonksFlags {
  active?: boolean;
  controlled?: string;
  trigger?: unknown;
  actions?: MonkAction[];
}

const monksFlags = (raw: FoundryDoc) =>
  (raw.flags as Record<string, unknown> | undefined)?.['monks-active-tiles'] as MonksFlags | undefined;

function triggerOf(
  when: { on: 'click' | 'enter'; gmOnly?: true },
  actions: TriggerAction[],
  flags: MonksFlags,
  near: number | undefined,
) {
  // A tile that only has words for the GM is the GM's to click.
  const noteOnly = actions.every((a) => a.type === 'message' && a.gmOnly);
  const gmOnly = when.gmOnly ?? (flags.controlled === 'gm' || (when.on === 'click' && noteOnly));
  const trigger: TileTrigger = {
    on: when.on,
    actions,
    ...(gmOnly ? { gmOnly: true } : {}),
    ...(flags.active === false ? { disabled: true } : {}),
    ...(near === undefined ? {} : { near }),
  };
  return trigger;
}

export interface ConvertedTrigger {
  trigger?: TileTrigger;
  /** Monk's actions that have no match here. */
  lost: string[];
}

/** The trigger for our tile `self`, from the Monk's Active Tiles flags of the Foundry tile it was made from. */
export function foundryTrigger(raw: FoundryDoc, self: string, lookups: TriggerLookups): ConvertedTrigger {
  const flags = monksFlags(raw);
  const all = flags?.actions ?? [];
  if (!flags || !all.length) return { lost: [] };
  const c: ActionContext = { ...lookups, self, segments: segmentsOf(all) };
  const acts = (a: MonkAction) => !!a.action && !!ACTIONS[a.action] && !unmatched(a, c);
  const actions = upToChoice(floorsFirst(pathOf(c.segments, acts).flatMap((a) => convert(a, c))));
  const lost = all.filter((a) => unmatched(a, c)).map((a) => a.action ?? '?');
  const when = onOf(flags.trigger);
  if (!when) return { lost: [...lost, `when: ${JSON.stringify(flags.trigger)}`] };
  if (!actions.length) return { lost };
  return { trigger: triggerOf(when, actions, flags, nearOf(all, c.gridSize) ?? undefined), lost };
}
