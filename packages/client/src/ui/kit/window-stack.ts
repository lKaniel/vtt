import { readJsonPref, writePref } from '../../prefs.ts';

// Floating windows over the table (sheets, journals, dialogs), as in
// Foundry: each can be dragged by its title bar, rolled up to it and
// resized, the last one touched sits on top, and each kind remembers where
// it was left in this browser. window.tsx draws them.

/** Where a window sits (its top left corner) and, once resized, how big it is. */
export interface Place {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Above the table's bars and panels, under popovers, menus and tooltips (z 1000). */
const BASE_Z = 100;
const MAX_Z = 990;
/** How much of a window must stay on screen: its title bar, and this much of its width. */
const TITLE_BAR = 32;
const KEEP_WIDE = 80;
const MIN_W = 260;
const MIN_H = 120;
const CASCADE = 30;

/** Which window is on top: the order they were last touched in. */
export class WindowStack {
  private order: string[] = [];
  private closers = new Map<string, () => void>();
  private listeners = new Set<() => void>();

  /** For useSyncExternalStore: call `fn` on every change; returns the unsubscribe. */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** A number that changes whenever the order does, for useSyncExternalStore. */
  version = 0;

  raise(id: string): void {
    if (this.top() === id) return;
    this.set([...this.order.filter((o) => o !== id), id]);
  }

  remove(id: string): void {
    if (this.order.includes(id)) this.set(this.order.filter((o) => o !== id));
  }

  /** How window `id` closes (Esc on the table closes the top one); undefined forgets. */
  setCloser(id: string, close: (() => void) | undefined): void {
    if (close) this.closers.set(id, close);
    else this.closers.delete(id);
  }

  /** Closes the highest window that can be closed this way; false when there is none. */
  closeTop(): boolean {
    const id = this.order.findLast((o) => this.closers.has(o));
    if (id === undefined) return false;
    this.closers.get(id)?.();
    return true;
  }

  top(): string | undefined {
    return this.order.at(-1);
  }

  zOf(id: string): number {
    const at = this.order.indexOf(id);
    return Math.min(BASE_Z + Math.max(at, 0), MAX_Z);
  }

  private set(order: string[]): void {
    this.order = order;
    this.version++;
    for (const fn of this.listeners) fn();
  }
}

/** The table's one stack of windows. */
export const windows = new WindowStack();

const clamp = (n: number, low: number, high: number) => Math.min(Math.max(n, low), Math.max(low, high));

/** `place` moved so its title bar stays on screen (and some of it in from each side). */
export function clampPlace(place: Place, size: Size, view: Size): Place {
  return {
    ...place,
    x: clamp(place.x, KEEP_WIDE - size.width, view.width - KEEP_WIDE),
    y: clamp(place.y, 0, view.height - TITLE_BAR),
  };
}

/** `place` (sized) grown by a drag of its corner, never below the smallest window. */
export function resized(place: Place & { w: number; h: number }, dx: number, dy: number): Place {
  return { ...place, w: Math.max(MIN_W, place.w + dx), h: Math.max(MIN_H, place.h + dy) };
}

/** The `n`th window of a kind opened at once steps down and right of the first, so none hides another. */
export function cascade(place: Place, n: number): Place {
  return { ...place, x: place.x + n * CASCADE, y: place.y + n * CASCADE };
}

type Storage = Parameters<typeof readJsonPref>[1];

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Where the `kind` window was left in this browser, if anywhere. */
export function readPlace(kind: string, storage?: Storage): Place | undefined {
  const value = readJsonPref(`window-${kind}`, storage) as Partial<Place> | undefined;
  if (!value || !isNumber(value.x) || !isNumber(value.y)) return undefined;
  const place: Place = { x: value.x, y: value.y };
  if (isNumber(value.w)) place.w = value.w;
  if (isNumber(value.h)) place.h = value.h;
  return place;
}

export function writePlace(kind: string, place: Place, storage?: Storage): void {
  writePref(`window-${kind}`, JSON.stringify(place), storage);
}
