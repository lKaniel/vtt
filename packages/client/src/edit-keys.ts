/** An edit command a key press asks for; "clipboard" is copy, cut or paste, handled by the clipboard events. */
export type EditKey = 'undo' | 'redo' | 'duplicate' | 'delete' | 'clipboard';

interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

const WITH_CTRL: Record<string, EditKey> = {
  y: 'redo',
  d: 'duplicate',
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
