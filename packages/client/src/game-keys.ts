import { editKey, editorKey, type EditKey, type EditorKey, type LayerKey } from './edit-keys.ts';
import { hotbarTiles } from './hotbar.ts';
import { actionOf, currentKeys } from './keybinds.ts';
import type { Session } from './session.ts';
import { spaceKey } from './space-pan.ts';
import { STEP_ACTIONS, stepTarget } from './stepping.ts';
import { activateTile, canActivate } from './tile-use.ts';

// The table's keyboard: the edit keys (undo, duplicate, the layer keys), the
// map editor's mode keys, targeting, sheets, walking with the arrows, the
// action bar's 1-0 and ending your turn. The keys themselves are bound in
// keybinds.ts and edit-keys.ts; GameScreen only starts the listeners.

/** What the game reads of a key press (a KeyboardEvent in the browser). */
type Key = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'defaultPrevented' | 'target' | 'preventDefault'
>;

/** Typing in a field keeps the field's own undo, copy and paste. */
function isTyping(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

/** Undo, redo, duplicate and delete; true when the key was one of the edit keys. */
function runEditKey(session: Session, e: Key): boolean {
  const command = editKey(e);
  if (!command) return false;
  // Copy, cut and paste arrive as clipboard events, which can reach the system clipboard.
  if (command === 'clipboard') return true;
  if (isLayerKey(command)) return runLayerKey(session, command, e);
  e.preventDefault();
  if (command === 'selectAll') session.selectAll();
  else if (command === 'undo') session.undo();
  else if (command === 'redo') session.redo();
  else if (command === 'duplicate') session.duplicate();
  else session.deleteSelected();
  return true;
}

const LAYER_KEYS = new Set<EditKey>(['group', 'ungroup', 'forward', 'backward', 'front', 'back', 'lock']);
const isLayerKey = (k: EditKey): k is LayerKey => LAYER_KEYS.has(k);

/** Group, ungroup, z-order and lock: tiles only. */
function runLayerKey(session: Session, command: LayerKey, e: Key): boolean {
  if (session.mode !== 'tiles' || !session.isGm()) return false;
  e.preventDefault();
  if (command === 'group') session.group();
  else if (command === 'ungroup') session.ungroup();
  else if (command === 'lock') session.toggleLock();
  else session.reorder(command);
  return true;
}

/**
 * Ctrl+C, Ctrl+X and Ctrl+V copy the selection through the system
 * clipboard (as JSON), so it pastes into another scene or browser tab.
 * Text selected on the page and text fields copy as usual.
 */
export function listenToClipboard(session: Session): () => void {
  const ours = () => !isTyping(document.activeElement) && !getSelection()?.toString();
  const onCopy = (e: ClipboardEvent) => {
    if (!ours()) return;
    const text = e.type === 'cut' ? session.cut() : session.copy();
    if (!text) return;
    e.clipboardData?.setData('text/plain', text);
    e.preventDefault();
  };
  const onPaste = (e: ClipboardEvent) => {
    if (!ours()) return;
    session.paste(e.clipboardData?.getData('text/plain'));
    e.preventDefault();
  };
  document.addEventListener('copy', onCopy);
  document.addEventListener('cut', onCopy);
  document.addEventListener('paste', onPaste);
  return () => {
    document.removeEventListener('copy', onCopy);
    document.removeEventListener('cut', onCopy);
    document.removeEventListener('paste', onPaste);
  };
}

/**
 * Esc in the editor: closes the menu, then goes back to the select tool,
 * then lets go of the selection, then back to the tokens mode. False when
 * there was nothing of the editor's to back out of.
 */
function backOutOfEditor(session: Session): boolean {
  if (session.menu) session.closeMenu();
  else if (session.rulers.clear()) return true;
  else if (session.mode === 'tokens') return false;
  else if (session.tool !== 'select') session.setTool('select');
  else if (session.selection.length) session.setSelection([]);
  else session.setMode('tokens');
  return true;
}

/** T in the tokens mode targets the creature under the pointer, or lets them all go over empty ground (see targets.ts). */
function targetKey(session: Session, e: Key): boolean {
  if (session.mode !== 'tokens' || e.shiftKey || !actionOf(e, currentKeys(), ['target'])) return false;
  return session.actions.toggleTargetAtPointer();
}

/** T, Shift+T, W, L, D, N and M switch modes (those this seat may use), R picks up the ruler; the arrows nudge outside the tokens mode. */
function runEditorKey(session: Session, e: Key): boolean {
  const key = editorKey(e, session.mode !== 'tokens');
  if (!key || ('mode' in key && !switches(session, key))) return false;
  e.preventDefault();
  if ('mode' in key) session.setMode(key.mode, key.tool);
  else session.nudge(key.nudge, key.big);
  return true;
}

/** Whether a mode key changes anything: a mode this seat may use, or a tool it isn't holding. */
function switches(session: Session, key: Extract<EditorKey, { mode: unknown }>): boolean {
  if (!session.canUseMode(key.mode)) return false;
  return key.mode !== session.mode || (!!key.tool && key.tool !== session.tool);
}

/** C opens the selected creature's sheet, or closes the open one. */
export function toggleSheet(session: Session): void {
  if (session.sheet) session.openSheet(undefined);
  else if (session.selected) session.openSheet({ kind: 'token', id: session.selected });
}

/**
 * E switches the open sheet to edit mode and back, or opens the selected
 * creature's sheet for editing: for the GM, and trusted players on their own tokens.
 */
function toggleEditor(session: Session): void {
  if (session.sheet) session.setSheetEdit(!session.sheet.edit);
  else if (session.selected && session.canEdit(session.selected))
    session.openSheet({ kind: 'token', id: session.selected }, true);
}

/** Arrow keys walk the selected creature one square. */
function step(session: Session, e: Key): boolean {
  const token = session.selected ? session.tokens.get(session.selected) : undefined;
  const id = actionOf(e, currentKeys(), STEP_ACTIONS);
  const to = token && id && session.world && stepTarget(token, id, session.world.gridSize);
  if (!token || !to) return false;
  e.preventDefault();
  session.move(token.id, to);
  return true;
}

/** Esc closes the sheet, puts away a readied attack or spell, or lets go of the selection. */
function backOut(session: Session): void {
  if (session.sheet) session.openSheet(undefined);
  else if (session.actions.armed ?? session.actions.aiming) session.actions.arm(undefined);
  else session.select(undefined);
}

/** The game's keys: the editor's, targeting, sheets, then the game's own (handleGameKey). */
export function gameKey(session: Session, e: Key): void {
  // A dialog or popup that closed on this key (Esc) has already handled it.
  if (e.defaultPrevented || isTyping(e.target)) return;
  if (runEditKey(session, e) || e.ctrlKey || e.metaKey) return;
  if (e.key === 'Escape' && backOutOfEditor(session)) return;
  if (targetKey(session, e) || runEditorKey(session, e)) return;
  const sheetKey = actionOf(e, currentKeys(), ['sheet', 'editSheet']);
  if (sheetKey === 'sheet') toggleSheet(session);
  else if (sheetKey === 'editSheet') toggleEditor(session);
  else handleGameKey(session, e);
}

/** Listens for the game's keys on the page; returns the cleanup. */
export function listenToKeys(session: Session): () => void {
  const onKey = (e: Key) => gameKey(session, e);
  addEventListener('keydown', onKey);
  return () => removeEventListener('keydown', onKey);
}

/** Space let go: a tap of it (no panning) ends your turn when Space is the end-turn key. */
export function spaceReleased(session: Session, e: Key): void {
  if (e.key !== ' ' || !spaceKey.release() || isTyping(e.target)) return;
  if (actionOf(e, currentKeys()) === 'endTurn' && session.turns.mine()) session.endTurn();
}

/** Space held makes a left drag pan the map (see space-pan.ts); returns the cleanup. */
export function listenToSpace(session: Session): () => void {
  const up = (e: Key) => spaceReleased(session, e);
  const blur = () => spaceKey.reset();
  addEventListener('keyup', up);
  addEventListener('blur', blur);
  return () => {
    removeEventListener('keyup', up);
    removeEventListener('blur', blur);
  };
}

/** Esc backs out, 1-0 use the action bar's tiles, the end-turn key ends your turn (or the player's own keys, keybinds.ts); Space held pans, so a Space end-turn waits for its release. */
function handleGameKey(session: Session, e: Key): void {
  if (step(session, e)) return;
  if (e.key === 'Escape') return backOut(session);
  const id = actionOf(e, currentKeys());
  // Space pans while held unless the player gave it to something else.
  if (e.key === ' ' && (!id || id === 'endTurn')) {
    e.preventDefault();
    spaceKey.press();
    return;
  }
  if (id === 'endTurn' && session.turns.mine()) {
    e.preventDefault();
    session.endTurn();
    return;
  }
  if (id?.startsWith('hotbar-')) pressSlot(session, id.slice(7));
}

/** Uses the selected creature's action bar tile in slot `hotkey` ("1".."0"). */
function pressSlot(session: Session, hotkey: string): void {
  const token = session.selected ? session.tokens.get(session.selected) : undefined;
  const tile = token && hotbarTiles(token, session.journal.macroOf).find((t) => t?.hotkey === hotkey);
  if (token && tile && canActivate(tile)) activateTile(session, token, tile);
}
