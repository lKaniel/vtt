import type { EditorMode, Point } from '@vtt/shared';

/** An edit command a key press asks for; "clipboard" is copy, cut or paste, handled by the clipboard events. */
export type EditKey = 'undo' | 'redo' | 'duplicate' | 'delete' | 'clipboard' | 'selectAll' | LayerKey;

/** Figma's layer keys: group, ungroup, z-order and lock (tiles). */
export type LayerKey = 'group' | 'ungroup' | 'forward' | 'backward' | 'front' | 'back' | 'lock';

interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

const WITH_CTRL: Record<string, EditKey> = {
  y: 'redo',
  d: 'duplicate',
  a: 'selectAll',
  c: 'clipboard',
  x: 'clipboard',
  v: 'clipboard',
};

/** With Ctrl (and Shift): Ctrl+G, Ctrl+Shift+G, Ctrl+] and [, with Shift to the front or back, Ctrl+Shift+L. */
const LAYER_KEYS: Record<string, [LayerKey, LayerKey]> = {
  g: ['group', 'ungroup'],
  ']': ['forward', 'front'],
  '[': ['backward', 'back'],
  '}': ['front', 'front'],
  '{': ['back', 'back'],
  l: ['lock', 'lock'],
};

/** Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y, Ctrl+D, Delete or Backspace, and the layer keys (Cmd for Ctrl on a Mac). */
export function editKey(e: KeyPress): EditKey | undefined {
  if (!e.ctrlKey && !e.metaKey) return e.key === 'Delete' || e.key === 'Backspace' ? 'delete' : undefined;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  return layerKey(key, e.shiftKey) ?? WITH_CTRL[key];
}

/** Ctrl+L alone is the browser's address bar: lock is Ctrl+Shift+L. */
function layerKey(key: string, shift: boolean): LayerKey | undefined {
  const layer = LAYER_KEYS[key];
  if (!layer || (key === 'l' && !shift)) return undefined;
  return shift ? layer[1] : layer[0];
}

/** A GM's editor key: switch mode, or nudge the selection. */
export type EditorKey = { mode: EditorMode } | { nudge: Point; big: boolean };

const MODE_KEYS: Record<string, EditorMode> = {
  t: 'tokens',
  w: 'walls',
  l: 'lights',
  d: 'drawings',
  n: 'notes',
  m: 'templates',
};
const ARROWS: Record<string, Point> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/**
 * T tokens, Shift+T tiles, W walls, L lights, D drawings, N notes, M
 * templates (players reach drawings and templates only); outside the tokens mode
 * (`editing`) the arrows nudge a pixel, or a square with Shift.
 */
export function editorKey(e: KeyPress, editing: boolean): EditorKey | undefined {
  if (e.ctrlKey || e.metaKey) return undefined;
  const arrow = ARROWS[e.key];
  if (arrow) return editing ? { nudge: arrow, big: e.shiftKey } : undefined;
  const key = e.key.toLowerCase();
  if (key === 't' && e.shiftKey) return { mode: 'tiles' };
  const mode = MODE_KEYS[key];
  return mode && { mode };
}
