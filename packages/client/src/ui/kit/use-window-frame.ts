import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { cascade, clampPlace, type Place, readPlace, resized, type Size, windows, writePlace } from './window-stack.ts';

// What makes a panel a window (window.tsx, and the kit's dialogs): dragged
// by its title bar, rolled up to it, resized from its corner, raised when
// touched, its place remembered per kind.

export interface FrameOptions {
  /** This window, in the stack: unique while it is open. */
  id: string;
  /** Remembers where the window was left under this name (one per kind of window); unset forgets. */
  kind?: string;
  /** Where it opens when nothing is remembered; undefined leaves it where its own CSS puts it (centred). */
  initial?: (view: Size) => Place | undefined;
  /** Opens this many steps down and right of where it would (the second sheet open at once, …). */
  offset?: number;
  /** Puts it on top whenever this turns true (a sheet opened again comes to the front). */
  front?: boolean;
  /** How it closes: Esc on the table closes the top window that has one. */
  onClose?: () => void;
}

/** What a press on these starts: their own thing, never a drag of the window. */
const NOT_A_HANDLE = 'button, input, textarea, select, a, label, [role="switch"], [role="combobox"], [data-no-drag]';

/** How wide a rolled-up window's title bar is, at most. */
const ROLLED_W = 320;

type Box = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

const viewOf = (el: Element | null): Size => {
  const view = el?.ownerDocument.defaultView ?? globalThis.window;
  return { width: view.innerWidth, height: view.innerHeight };
};

/** Follows the pointer from a press on `el` until it lets go: `move` with how far it went, `done` at the end. */
function follow(e: ReactPointerEvent<HTMLElement>, move: (dx: number, dy: number) => void, done: () => void): void {
  const el = e.currentTarget;
  const [x0, y0] = [e.clientX, e.clientY];
  el.setPointerCapture(e.pointerId);
  const onMove = (m: PointerEvent) => move(m.clientX - x0, m.clientY - y0);
  const onUp = () => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    done();
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

/** The place a window at `start` (drawn at `box`) lands on when dragged by `by`, kept on screen. */
function dragged(start: Place, box: Box, by: { dx: number; dy: number; view: Size }): Place {
  const to = clampPlace({ x: box.left + by.dx, y: box.top + by.dy }, box, by.view);
  return { ...start, x: start.x + to.x - box.left, y: start.y + to.y - box.top };
}

function firstPlace({ kind, initial, offset }: FrameOptions): Place | undefined {
  const place = (kind ? readPlace(kind) : undefined) ?? initial?.(viewOf(null));
  return place && offset ? cascade(place, offset) : place;
}

/** Where the window `el` is now: its place, or (never moved) where its CSS put it. */
function hereOf(el: HTMLElement | null, place: Place | undefined): { place: Place; box: Box } {
  const box = el?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };
  return { place: place ?? { x: box.left, y: box.top }, box };
}

export function useWindowFrame(options: FrameOptions) {
  const { id, kind, onClose, front } = options;
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [place, setPlace] = useState<Place | undefined>(() => firstPlace(options));
  const [collapsed, setCollapsed] = useState(false);
  const z = useSyncExternalStore(windows.subscribe, () => windows.zOf(id));
  useEffect(() => {
    windows.raise(id);
    return () => windows.remove(id);
  }, [id]);
  useEffect(() => {
    if (front) windows.raise(id);
  }, [id, front]);
  useEffect(() => {
    windows.setCloser(id, onClose);
    return () => windows.setCloser(id, undefined);
  }, [id, onClose]);

  /** Follows a drag from `e`, placing the window where `to` says; remembers where it ends. */
  const track = (e: ReactPointerEvent<HTMLElement>, to: (dx: number, dy: number) => Place) => {
    e.preventDefault();
    let last: Place | undefined;
    follow(
      e,
      (dx, dy) => {
        last = to(dx, dy);
        setPlace(last);
      },
      () => kind && last && writePlace(kind, last),
    );
  };

  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest(NOT_A_HANDLE)) return;
    const { place: start, box } = hereOf(el, place);
    track(e, (dx, dy) => dragged(start, box, { dx, dy, view: viewOf(el) }));
  };

  const startResize = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const { place: start, box } = hereOf(el, place);
    const sized = { ...start, w: start.w ?? box.width, h: start.h ?? box.height };
    track(e, (dx, dy) => resized(sized, dx, dy));
  };

  /** Rolls it up to its title bar, or down again; it stays where it is. */
  const toggle = () => {
    if (!place) setPlace(hereOf(el, place).place);
    setCollapsed((c) => !c);
  };

  return {
    /** The window's element (a callback ref). */
    ref: setEl,
    collapsed,
    toggle,
    /** Puts it on top: on any press inside. */
    raise: () => windows.raise(id),
    /** The title bar's handlers: drag it to move the window, double-click it to roll the window up. */
    handle: {
      onPointerDown: startDrag,
      onDoubleClick: (e: ReactMouseEvent<HTMLElement>) => {
        if (!(e.target as Element).closest(NOT_A_HANDLE)) toggle();
      },
    },
    startResize,
    style: styleOf(place, collapsed, z),
  };
}

function styleOf(place: Place | undefined, collapsed: boolean, z: number): CSSProperties {
  if (!place) return { zIndex: z };
  return {
    zIndex: z,
    left: place.x,
    top: place.y,
    translate: 'none',
    // Rolled up, a window is its title bar, and no wider than a title needs.
    width: collapsed ? Math.min(place.w ?? ROLLED_W, ROLLED_W) : place.w,
    height: collapsed ? undefined : place.h,
  };
}
