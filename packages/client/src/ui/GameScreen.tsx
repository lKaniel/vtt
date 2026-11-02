import { Redo2Icon, Undo2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SoundScape } from '../audio.ts';
import { MapView } from '../canvas/MapView.ts';
import { editKey, editorKey, type EditKey, type EditorKey, type LayerKey } from '../edit-keys.ts';
import { hotbarTiles } from '../hotbar.ts';
import { Session } from '../session.ts';
import { stepTarget } from '../stepping.ts';
import { activateTile, ActionBar, canActivate } from './ActionBar.tsx';
import { CharacterSheet } from './CharacterSheet.tsx';
import { ClockBar } from './clock/ClockBar.tsx';
import { ChatPanel } from './ChatPanel.tsx';
import { ContextMenu } from './ContextMenu.tsx';
import { blockNativeMenu } from '../native-menu.ts';
import { Inspector } from './Inspector.tsx';
import { JournalViewer } from './JournalViewer.tsx';
import { MapTools } from './MapTools.tsx';
import { PartyBar } from './PartyBar.tsx';
import { ObserveBanner } from './ObserveBanner.tsx';
import { PauseBanner, PauseButton } from './PauseBanner.tsx';
import { ReactionPrompt } from './ReactionPrompt.tsx';
import { SceneNav } from './SceneNav.tsx';
import { TokenHud } from './TokenHud.tsx';
import { TurnOrder } from './TurnOrder.tsx';
import { useSession } from './useSession.ts';
import { SettingsMenu } from './SettingsMenu.tsx';
import { Button } from './kit/button.tsx';

export function GameScreen({
  playerId,
  gameId,
  onLeave,
}: Readonly<{ playerId?: string; gameId?: string; onLeave: () => void }>) {
  const [session] = useState(() => new Session(playerId, gameId));
  const host = useRef<HTMLDivElement>(null);
  useSession(session);

  useEffect(() => {
    const map = new MapView(session);
    let live = true;
    // Connect once the map listens, so it sees the first world snapshot.
    void map.init(host.current!).then(() => live && session.connect());
    return () => {
      live = false;
      session.close();
      map.destroy();
    };
  }, [session]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dialog or popup that closed on this key (Esc) has already handled it.
      if (e.defaultPrevented || isTyping(e.target)) return;
      if (runEditKey(session, e) || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape' && backOutOfEditor(session)) return;
      if (targetKey(session, e) || runEditorKey(session, e)) return;
      if (e.key === 'c') toggleSheet(session);
      else if (e.key === 'e') toggleEditor(session);
      else handleGameKey(session, e);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [session]);

  useEffect(() => listenToClipboard(session), [session]);
  useEffect(() => blockNativeMenu(document), []);
  useEffect(() => {
    const sound = new SoundScape(session);
    return () => sound.destroy();
  }, [session]);

  return (
    // The party portraits move down under the scene navigation bar while it shows.
    <div className="game has-[[data-slot=scene-nav]]:[&_.party]:top-[84px]!">
      <div className="map" ref={host} />
      <header className="topbar frame">
        <span
          className={`status status-${session.status}`}
          title={session.status === 'open' ? 'Connected' : session.status}
        />
        <strong className="world-name">{session.world?.name ?? 'Connecting…'}</strong>
        {session.sceneName && <span className="scene-name">{session.sceneName}</span>}
        <ClockBar session={session} />
        <span className="you" style={{ color: session.you?.color }}>
          {session.you?.name}
        </span>
        <PauseButton session={session} />
        <UndoButtons session={session} />
        <SettingsMenu session={session} />
        <Button variant="link" onClick={onLeave}>
          Leave
        </Button>
      </header>
      <SceneNav session={session} />
      <TurnOrder session={session} onStart={() => session.startCombat(session.fightersInView())} />
      <PartyBar session={session} />
      <MapTools session={session} />
      <Inspector session={session} />
      <JournalViewer session={session} />
      <ReactionPrompt session={session} />
      <ActionBar session={session} onSheet={() => toggleSheet(session)} />
      <CharacterSheet session={session} />
      <ChatPanel session={session} />
      <Toast session={session} />
      <ContextMenu session={session} />
      <TokenHud session={session} />
      <PauseBanner session={session} />
      <ObserveBanner session={session} />
    </div>
  );
}

/** Typing in a field keeps the field's own undo, copy and paste. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** Undo, redo, duplicate and delete; true when the key was one of the edit keys. */
function runEditKey(session: Session, e: KeyboardEvent): boolean {
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
function runLayerKey(session: Session, command: LayerKey, e: KeyboardEvent): boolean {
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
function listenToClipboard(session: Session): () => void {
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

/** ↶ and ↷ in the top bar, named after what they would undo or redo. */
function UndoButtons({ session }: Readonly<{ session: Session }>) {
  const { undo, redo } = session.history;
  return (
    <span className="undo-buttons">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!undo}
        onClick={() => session.undo()}
        title={undo ? `Undo the ${undo} (Ctrl+Z)` : 'Nothing to undo'}
        aria-label="Undo"
      >
        <Undo2Icon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!redo}
        onClick={() => session.redo()}
        title={redo ? `Redo the ${redo} (Ctrl+Shift+Z)` : 'Nothing to redo'}
        aria-label="Redo"
      >
        <Redo2Icon />
      </Button>
    </span>
  );
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
function targetKey(session: Session, e: KeyboardEvent): boolean {
  if (e.key.toLowerCase() !== 't' || e.shiftKey || session.mode !== 'tokens') return false;
  return session.toggleTargetAtPointer();
}

/** T, Shift+T, W, L, D, N and M switch modes (those this seat may use), R picks up the ruler; the arrows nudge outside the tokens mode. */
function runEditorKey(session: Session, e: KeyboardEvent): boolean {
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
function toggleSheet(session: Session): void {
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
function step(session: Session, e: KeyboardEvent): boolean {
  const token = session.selected ? session.tokens.get(session.selected) : undefined;
  const to = token && session.world && stepTarget(token, e.key, session.world.gridSize);
  if (!token || !to) return false;
  e.preventDefault();
  session.move(token.id, to);
  return true;
}

/** Esc closes the sheet, puts away a readied attack or spell, or lets go of the selection. */
function backOut(session: Session): void {
  if (session.sheet) session.openSheet(undefined);
  else if (session.armed ?? session.aiming) session.arm(undefined);
  else session.select(undefined);
}

/** Esc backs out, 1-0 use the action bar's tiles, Space ends your turn. */
function handleGameKey(session: Session, e: KeyboardEvent): void {
  if (step(session, e)) return;
  if (e.key === 'Escape') return backOut(session);
  if (e.key === ' ' && session.isMyTurn()) {
    e.preventDefault();
    session.endTurn();
    return;
  }
  const token = session.selected ? session.tokens.get(session.selected) : undefined;
  const tile = token && hotbarTiles(token).find((t) => t?.hotkey === e.key);
  if (token && tile && canActivate(tile)) activateTile(session, token, tile);
}

const TOAST_MS = 3000;

function Toast({ session }: Readonly<{ session: Session }>) {
  const [dismissed, setDismissed] = useState<number>();
  const error = session.error;
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => {
      setDismissed(error.at);
    }, TOAST_MS);
    return () => {
      clearTimeout(t);
    };
  }, [error]);
  if (!error || dismissed === error.at) return null;
  return <div className={error.info ? 'toast toast-info' : 'toast'}>{error.message}</div>;
}
