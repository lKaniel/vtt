import type { EditorMode, Point } from '@vtt/shared';

/** An edit command a key press asks for; "clipboard" is copy, cut or paste, handled by the clipboard events. */
export type EditKey = 'undo' | 'redo' | 'duplicate' | 'delete' | 'clipboard' | 'selectAll';

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

/** Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y, Ctrl+D, Delete or Backspace (Cmd for Ctrl on a Mac). */
export function editKey(e: KeyPress): EditKey | undefined {
  if (!e.ctrlKey && !e.metaKey) return e.key === 'Delete' || e.key === 'Backspace' ? 'delete' : undefined;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  return WITH_CTRL[key];
}

/** A GM's editor key: switch mode, or nudge the selection. */
export type EditorKey = { mode: EditorMode } | { nudge: Point; big: boolean };

const MODE_KEYS: Record<string, EditorMode> = { t: 'tokens', w: 'walls', l: 'lights' };
const ARROWS: Record<string, Point> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/**
 * T tokens, Shift+T tiles, W walls, L lights; outside the tokens mode
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
