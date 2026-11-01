import { rectBetween, type MarqueeMode, type Point, type Rect } from '@vtt/shared';
import { clickSelect, marqueeSelect, type Mods } from './selection.ts';

// The pointer gestures of the map editor, the same in every mode: click to
// select, drag empty space for a marquee, drag a thing to move the selection,
// drag a handle to reshape. It knows nothing of Pixi or documents: the host
// says what is where and applies the result.

export interface EditorHost {
  /** The topmost thing of the current mode under `p`. */
  pick(p: Point): string | undefined;
  /** A handle of a selected thing under `p`. */
  pickHandle(p: Point): { key: string; handle: string } | undefined;
  inRect(r: Rect, mode: MarqueeMode): string[];
  selection(): readonly string[];
  setSelection(keys: string[]): void;
  /** How far (map pixels) the pointer must go before a press becomes a drag. */
  slop(): number;
  commitMove(keys: readonly string[], delta: Point, free: boolean): void;
  commitHandle(key: string, handle: string, to: Point, free: boolean): void;
}

/** What a gesture in progress looks like, for drawing it. */
export type Preview =
  | { kind: 'marquee'; rect: Rect }
  | { kind: 'move'; keys: readonly string[]; delta: Point; free: boolean }
  | { kind: 'handle'; key: string; handle: string; to: Point; free: boolean };

type Gesture =
  | { kind: 'press'; start: Point; mods: Mods; key?: string; grip?: { key: string; handle: string } }
  | { kind: 'marquee'; start: Point; now: Point; alt: boolean }
  | { kind: 'move'; start: Point; keys: readonly string[]; delta: Point; free: boolean }
  | { kind: 'handle'; key: string; handle: string; to: Point; free: boolean };

const far = (a: Point, b: Point, slop: number): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) > slop;

export class EditorController {
  private gesture?: Gesture;

  constructor(private host: EditorHost) {}

  /** A press, drag or marquee is in progress. */
  get busy(): boolean {
    return !!this.gesture;
  }

  down(at: Point, mods: Mods): void {
    const grip = this.host.pickHandle(at);
    this.gesture = { kind: 'press', start: at, mods, ...(grip ? { grip } : { key: this.host.pick(at) }) };
  }

  move(at: Point, mods: Mods): void {
    const g = this.gesture;
    if (g?.kind === 'press') {
      if (far(at, g.start, this.host.slop())) this.gesture = this.startDrag(g, at, mods);
      return;
    }
    if (g?.kind === 'marquee') g.now = at;
    else if (g?.kind === 'move')
      this.gesture = { ...g, delta: [at[0] - g.start[0], at[1] - g.start[1]], free: mods.shift };
    else if (g?.kind === 'handle') this.gesture = { ...g, to: at, free: mods.shift };
  }

  up(at: Point, mods: Mods): void {
    this.move(at, mods);
    const g = this.gesture;
    this.gesture = undefined;
    if (!g) return;
    switch (g.kind) {
      case 'press':
        if (!g.grip) this.host.setSelection(clickSelect(this.host.selection(), g.key, g.mods));
        return;
      case 'marquee':
        return this.finishMarquee(g, mods);
      case 'move':
        return this.host.commitMove(g.keys, g.delta, g.free);
      case 'handle':
        return this.host.commitHandle(g.key, g.handle, g.to, g.free);
    }
  }

  cancel(): void {
    this.gesture = undefined;
  }

  preview(): Preview | undefined {
    const g = this.gesture;
    if (!g || g.kind === 'press') return undefined;
    if (g.kind === 'marquee') return { kind: 'marquee', rect: rectBetween(g.start, g.now) };
    if (g.kind === 'move') return { kind: 'move', keys: g.keys, delta: g.delta, free: g.free };
    return g;
  }

  private startDrag(press: Extract<Gesture, { kind: 'press' }>, at: Point, mods: Mods): Gesture {
    const free = mods.shift;
    if (press.grip) return { kind: 'handle', ...press.grip, to: at, free };
    if (!press.key) return { kind: 'marquee', start: press.start, now: at, alt: press.mods.alt };
    // Figma's rule: dragging something not selected selects it (alone) and drags it.
    let keys: readonly string[] = this.host.selection();
    if (!keys.includes(press.key)) {
      this.host.setSelection([press.key]);
      keys = [press.key];
    }
    return { kind: 'move', start: press.start, keys, delta: [at[0] - press.start[0], at[1] - press.start[1]], free };
  }

  private finishMarquee(g: Extract<Gesture, { kind: 'marquee' }>, mods: Mods): void {
    const mode: MarqueeMode = g.alt || mods.alt ? 'contain' : 'touch';
    const hits = this.host.inRect(rectBetween(g.start, g.now), mode);
    this.host.setSelection(marqueeSelect(this.host.selection(), hits, mods));
  }
}
