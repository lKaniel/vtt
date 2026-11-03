import type { TileTrigger, TriggerAction, TriggerTarget } from '@vtt/shared';
import type { FoundryDoc } from './foundry-db.ts';
import { originOf } from './foundry-origin.ts';
import type { MediaLookup } from './foundry-scene.ts';

// Monk's Active Tiles as our tile triggers (trigger-schema.ts in shared):
// what a tile does when it is clicked or walked onto. Its actions point at
// things by Tagger tag, Foundry id or "this tile"; the scene's index finds
// ours. Monk's jumps (anchors, goto, dialogs) become the one path a click
// most likely takes: the actions before the first anchor, else the "next"
// branch. What has no match (macros, alter, animations) is reported.

/** Where a converted thing came from, to find it again by Foundry id or tag. */
interface Indexed {
  target: Target;
  raw: FoundryDoc;
  id?: string;
  tags: string[];
}

interface Target {
  coll: TriggerTarget['coll'] | 'walls';
  id: string;
}

/** Our scene's things, found by what Monk's actions call them. */
export class SceneIndex {
  private readonly items: Indexed[] = [];

  /** Adds a list of converted things (made by the import, so their Foundry documents are known). */
  add(coll: Target['coll'], list: readonly { id: string }[]): this {
    for (const item of list) {
      const raw = originOf(item);
      if (!raw) continue;
      const tags = (raw.flags as { tagger?: { tags?: unknown } } | undefined)?.tagger?.tags;
      const id = typeof raw._id === 'string' ? raw._id : undefined;
      this.items.push({ target: { coll, id: item.id }, raw, id, tags: Array.isArray(tags) ? tags.map(String) : [] });
    }
    return this;
  }

  /** Our things for a Monk's entity: "tagger:<tag>[, tag]" ({#} any number), a Foundry uuid or id. */
  // fallow-ignore-next-line unused-class-member -- targets() calls it through TriggerLookups.index
  find(entity: string, colls?: readonly Target['coll'][]): Target[] {
    const ok = (x: Indexed) => !colls || colls.includes(x.target.coll);
    if (entity.startsWith('tagger:')) {
      const patterns = entity.slice(7).split(',').map(tagPattern);
      return this.items
        .filter((x) => ok(x) && x.tags.some((t) => patterns.some((p) => p.test(t))))
        .map((x) => x.target);
    }
    const id = entity.split('.').pop();
    return this.items.filter((x) => ok(x) && x.id === id).map((x) => x.target);
  }

  /** The Foundry document a converted thing came from. */
  rawOf(target: Target): FoundryDoc | undefined {
    return this.items.find((x) => x.target.coll === target.coll && x.target.id === target.id)?.raw;
  }
}

const tagPattern = (tag: string) =>
  new RegExp(
    `^${tag
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\{#\\\}/g, '\\d+')}$`,
  );

export interface TriggerLookups {
  index: SceneIndex;
  media: MediaLookup;
  /** Every file a Foundry pattern with `*` names (in the Data folder). */
  glob: (pattern: string) => string[];
  /** Our scene id for a Foundry scene id. */
  scene: (foundryId: string) => string | undefined;
  /** The pictures Monk's cycles a tile through, by our tile id. */
  imagesOf: (tile: string) => string[];
}

interface MonkAction {
  action?: string;
  data?: Record<string, unknown>;
}

/** The tile itself, the creature that set it off, or what the entity names. */
type Entity = string | undefined;

const entityOf = (d: Record<string, unknown> | undefined): Entity => {
  const e = d?.entity;
  if (typeof e === 'string') return e;
  const id = (e as { id?: unknown } | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
};

interface ActionContext extends TriggerLookups {
  /** Our id of the tile the trigger is on. */
  self: string;
}

function targets(entity: Entity, c: ActionContext, colls?: readonly Target['coll'][]): Target[] {
  if (!entity || entity === 'tile') return !colls || colls.includes('tiles') ? [{ coll: 'tiles', id: c.self }] : [];
  if (entity === 'token' || entity === 'players' || entity === 'within') return [];
  return c.index.find(entity, colls);
}

const SEEN = ['tiles', 'tokens', 'regions', 'drawings', 'notes', 'sounds', 'lights'] as const;
const seen = (t: Target): t is TriggerTarget => (SEEN as readonly string[]).includes(t.coll);

const plain = (html: unknown) =>
  typeof html === 'string'
    ? html
        .replace(/<[^<>]*>/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .join(' ')
    : '';

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
  notification: message,
  chatmessage: message,
};

/** Monk's actions that change nothing on their own (timing, labels). */
const QUIET = new Set(['delay', 'anchor', 'stop', 'goto']);

/** The actions a click most likely runs: before the first anchor; else the "next" branch, else the first that does something. */
function path(actions: MonkAction[]): MonkAction[] {
  const segments: { tag?: string; actions: MonkAction[] }[] = [{ actions: [] }];
  for (const a of actions) {
    if (a.action === 'anchor') segments.push({ tag: typeof a.data?.tag === 'string' ? a.data.tag : '', actions: [] });
    else segments.at(-1)!.actions.push(a);
  }
  const upToJump = (s: MonkAction[]) => {
    const end = s.findIndex((a) => a.action === 'goto' || a.action === 'stop');
    return end < 0 ? s : s.slice(0, end);
  };
  const acting = (s: { actions: MonkAction[] }) => s.actions.some((a) => a.action && ACTIONS[a.action]);
  const first = acting(segments[0]!) ? segments[0] : undefined;
  const chosen = first ?? segments.find((s) => s.tag === 'next' && acting(s)) ?? segments.find(acting);
  return upToJump(chosen?.actions ?? []);
}

/** When Monk's runs it: walked onto, else clicked (right-click and "manual" ones: by the GM). */
function onOf(trigger: unknown): { on: 'click' | 'enter'; gmOnly?: true } | undefined {
  const all = (Array.isArray(trigger) ? trigger : [trigger]).map(String);
  if (all.includes('enter')) return { on: 'enter' };
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

function triggerOf(when: { on: 'click' | 'enter'; gmOnly?: true }, actions: TriggerAction[], flags: MonksFlags) {
  const gmOnly = when.gmOnly ?? flags.controlled === 'gm';
  const trigger: TileTrigger = {
    on: when.on,
    actions,
    ...(gmOnly ? { gmOnly: true } : {}),
    ...(flags.active === false ? { disabled: true } : {}),
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
  const c: ActionContext = { ...lookups, self };
  const actions = path(all).flatMap((a) => ACTIONS[a.action ?? '']?.(a, c) ?? []);
  const lost = all.map((a) => a.action ?? '?').filter((name) => !ACTIONS[name] && !QUIET.has(name));
  const when = onOf(flags.trigger);
  if (!when) return { lost: [...lost, `when: ${JSON.stringify(flags.trigger)}`] };
  if (!actions.length) return { lost };
  return { trigger: triggerOf(when, actions, flags), lost };
}
