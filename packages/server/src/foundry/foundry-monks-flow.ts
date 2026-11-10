import type { TriggerAction } from '@vtt/shared';

// The flow of Monk's Active Tiles: its landings (anchors) and jumps (goto,
// stop), and the dialogs whose buttons jump to a landing. A click runs one
// path through them (pathOf); a dialog with buttons becomes a choice whose
// answers each run the path from their landing (choiceOf). Turning a single
// action into ours is foundry-active-tiles.ts's (`convert`).

export interface MonkAction {
  action?: string;
  data?: Record<string, unknown>;
}

/** Turns one Monk's action into ours. */
export type Convert = (a: MonkAction) => TriggerAction[];

/** A run of actions after a landing (the first has none). */
interface Segment {
  tag?: string;
  /** Monk's "stop when reached": running into this landing ends the path. */
  stops: boolean;
  actions: MonkAction[];
}

const tagOf = (a: MonkAction) => (typeof a.data?.tag === 'string' ? a.data.tag : '');

/** The actions split at their landings. */
export function segmentsOf(actions: readonly MonkAction[]): Segment[] {
  const segments: Segment[] = [{ stops: false, actions: [] }];
  for (const a of actions) {
    if (a.action === 'anchor') segments.push({ tag: tagOf(a), stops: a.data?.stop !== false, actions: [] });
    else segments.at(-1)!.actions.push(a);
  }
  return segments;
}

/** How deep jumps are followed (a loop of gotos ends here). */
const MAX_JUMPS = 8;

/** The actions run from landing `tag` on: through gotos and into landings that do not stop, up to a stop. */
function fromLanding(segments: readonly Segment[], tag: string, jumps = 0): MonkAction[] {
  const at = segments.findIndex((s) => s.tag === tag);
  if (at < 0 || jumps > MAX_JUMPS) return [];
  const after = segments.slice(at + 1);
  const end = after.findIndex((s) => s.stops);
  // The landing and those after it that do not stop, run as one list.
  const run = [segments[at]!, ...(end < 0 ? after : after.slice(0, end))].flatMap((s) => s.actions);
  const jump = run.findIndex((a) => a.action === 'stop' || a.action === 'goto');
  if (jump < 0) return run;
  const next = run[jump]!.action === 'goto' ? fromLanding(segments, tagOf(run[jump]!), jumps + 1) : [];
  return [...run.slice(0, jump), ...next];
}

/** HTML as plain words. */
export const plain = (html: unknown) =>
  typeof html === 'string'
    ? html
        .replace(/<[^<>]*>/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .join(' ')
    : '';

/** A dialog's buttons and the landing each jumps to. */
function buttonsOf(d: Record<string, unknown>): { label: string; goto: string }[] {
  const landing = (x: unknown) => (typeof x === 'string' ? x : '');
  if (d.dialogtype === 'confirm' && (landing(d.yes) || landing(d.no)))
    return [
      { label: 'Yes', goto: landing(d.yes) },
      { label: 'No', goto: landing(d.no) },
    ];
  if (d.dialogtype !== 'custom' || !Array.isArray(d.buttons)) return [];
  return (d.buttons as { name?: unknown; goto?: unknown }[])
    .filter((b) => typeof b.name === 'string' && b.name)
    .map((b) => ({ label: String(b.name), goto: typeof b.goto === 'string' ? b.goto : '' }));
}

/** A dialog with buttons as a choice, each answer running the path from its landing; none for other dialogs. */
export function choiceOf(a: MonkAction, segments: readonly Segment[], convert: Convert): TriggerAction[] {
  const d = a.data ?? {};
  const buttons = buttonsOf(d).slice(0, 8);
  const text = plain(d.content) || plain(d.title);
  if (!buttons.length || !text) return [];
  const answer = (goto: string) =>
    fromLanding(segments, goto)
      .flatMap(convert)
      .filter((x) => x.type !== 'choice');
  const options = buttons.map((b) => ({ label: b.label, actions: answer(b.goto) }));
  const title = plain(d.title);
  return [{ type: 'choice', ...(title && title !== text ? { title } : {}), text, options }];
}

/** The actions up to a jump, and the choice that ends them, if one does. */
export function upToChoice(actions: TriggerAction[]): TriggerAction[] {
  const at = actions.findIndex((x) => x.type === 'choice');
  return at < 0 ? actions : actions.slice(0, at + 1);
}

/**
 * The actions a click most likely runs: before the first landing; else the
 * "next" branch, else the first that does something; each up to its jump.
 */
export function pathOf(segments: readonly Segment[], acts: (a: MonkAction) => boolean): MonkAction[] {
  const upToJump = (s: MonkAction[]) => {
    const end = s.findIndex((a) => a.action === 'goto' || a.action === 'stop');
    return end < 0 ? s : s.slice(0, end);
  };
  const acting = (s: Segment) => s.actions.some(acts);
  const first = acting(segments[0]!) ? segments[0] : undefined;
  const chosen = first ?? segments.find((s) => s.tag === 'next' && acting(s)) ?? segments.find(acting);
  return upToJump(chosen?.actions ?? []);
}
