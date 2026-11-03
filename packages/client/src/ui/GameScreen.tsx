import { Redo2Icon, Undo2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SoundScape } from '../audio/audio.ts';
import { MapView } from '../canvas/MapView.ts';
import { Session } from '../session/session.ts';
import { ActionBar } from './ActionBar.tsx';
import { listenToClipboard, listenToKeys, listenToSpace, toggleSheet } from '../keys/game-keys.ts';
import { Sheets } from './sheet/PoppedSheets.tsx';
import { ClockBar } from './clock/ClockBar.tsx';
import { ChatPanel } from './ChatPanel.tsx';
import { ContextMenu } from './ContextMenu.tsx';
import { blockNativeMenu } from '../keys/native-menu.ts';
import { ImageViewer } from './ImageViewer.tsx';
import { PileWindow } from './PileWindow.tsx';
import { DiceOverlay } from './DiceOverlay.tsx';
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
import { exposeApi } from '../scripting/script-api.ts';

export function GameScreen({ gameId, onLeave }: Readonly<{ gameId?: string; onLeave: () => void }>) {
  const [session] = useState(() => new Session(gameId));
  const host = useRef<HTMLDivElement>(null);
  useSession(session);

  useEffect(() => openMap(session, host.current!), [session]);

  useEffect(() => listenToKeys(session), [session]);
  useEffect(() => listenToSpace(session), [session]);
  useEffect(() => listenToClipboard(session), [session]);
  useEffect(() => exposeApi(session.scripts.vtt), [session]);
  useEffect(() => blockNativeMenu(document), []);
  useEffect(() => {
    const sound = new SoundScape(session);
    return () => sound.destroy();
  }, [session]);

  return (
    // The party portraits move down under the scene navigation bar while it shows.
    <div className="game has-[[data-slot=scene-nav]]:[&_.party]:top-[84px]!">
      <div className="map" ref={host} />
      <TopBar session={session} onLeave={onLeave} />
      <SceneNav session={session} />
      <TurnOrder
        session={session}
        onStart={(shared) => session.requests.startCombat(session.editor.fightersInView(), shared)}
      />
      <PartyBar session={session} />
      <MapTools session={session} />
      <Inspector session={session} />
      <JournalViewer session={session} />
      <ImageViewer session={session} />
      <PileWindow session={session} />
      <DiceOverlay session={session} />
      <ReactionPrompt session={session} />
      <ActionBar session={session} onSheet={() => toggleSheet(session)} />
      <Sheets session={session} />
      <ChatPanel session={session} />
      <Toast session={session} />
      <ContextMenu session={session} />
      <TokenHud session={session} />
      <PauseBanner session={session} />
      <ObserveBanner session={session} />
    </div>
  );
}

/** The bar across the top: connection, game and scene, clock, you, pause, undo, settings, leave. */
function TopBar({ session, onLeave }: Readonly<{ session: Session; onLeave: () => void }>) {
  return (
    <header className="topbar frame">
      <span
        className={`status status-${session.status}`}
        title={session.status === 'open' ? 'Connected' : session.status}
      />
      <strong className="world-name">{session.world?.name ?? 'Connecting…'}</strong>
      {session.scenes.name && <span className="scene-name">{session.scenes.name}</span>}
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
  );
}

/** ↶ and ↷ in the top bar, named after what they would undo or redo. */
function UndoButtons({ session }: Readonly<{ session: Session }>) {
  const { undo, redo } = session.edits.history;
  return (
    <span className="undo-buttons">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!undo}
        onClick={() => session.edits.undo()}
        title={undo ? `Undo the ${undo} (Ctrl+Z)` : 'Nothing to undo'}
        aria-label="Undo"
      >
        <Undo2Icon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!redo}
        onClick={() => session.edits.redo()}
        title={redo ? `Redo the ${redo} (Ctrl+Shift+Z)` : 'Nothing to redo'}
        aria-label="Redo"
      >
        <Redo2Icon />
      </Button>
    </span>
  );
}

/** The map in `host`, and the connection once it listens (so it sees the first world snapshot); returns the cleanup. */
function openMap(session: Session, host: HTMLDivElement): () => void {
  const map = new MapView(session);
  let live = true;
  void map.init(host).then(() => live && session.connect());
  return () => {
    live = false;
    session.close();
    map.destroy();
  };
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
