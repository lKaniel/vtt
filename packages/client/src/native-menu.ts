/**
 * The game shows its own right-click menus, so the browser's menu stays shut
 * everywhere in the game screen. Text fields keep it, for spelling and paste.
 *
 * The canvas alone is not enough: our menu opens on pointer down, and on
 * Windows the browser fires `contextmenu` on pointer up, over whatever is
 * under the pointer by then (often our own menu).
 */
interface MenuTarget {
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

export interface MenuEvent {
  target: unknown;
  preventDefault: () => void;
}

interface Listens {
  addEventListener: (type: 'contextmenu', fn: (e: MenuEvent) => void) => void;
  removeEventListener: (type: 'contextmenu', fn: (e: MenuEvent) => void) => void;
}

const TEXT_FIELD = 'input, textarea';

/** True inside a text field or editable text, where the browser's menu is useful. */
export function keepsNativeMenu(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as MenuTarget;
  if (el.isContentEditable) return true;
  return Boolean(el.closest?.(TEXT_FIELD));
}

/** Stops the browser's menu on `doc` outside text fields; returns the undo. */
export function blockNativeMenu(doc: Listens): () => void {
  const onMenu = (e: MenuEvent) => {
    if (!keepsNativeMenu(e.target)) e.preventDefault();
  };
  doc.addEventListener('contextmenu', onMenu);
  return () => doc.removeEventListener('contextmenu', onMenu);
}
