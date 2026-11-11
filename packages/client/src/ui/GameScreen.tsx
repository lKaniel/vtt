import { BookOpenIcon, BoxIcon, GhostIcon, LogOutIcon, MapIcon, Redo2Icon, Undo2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SoundScape } from '../audio/audio.ts';
import { MapView } from '../canvas/MapView.ts';
import { t } from '../i18n/index.ts';
import { followView3d } from '../view3d/view3d-switch.ts';
import { Session } from '../session/session.ts';
import { ActionBar } from './ActionBar.tsx';
import { listenToClipboard, listenToKeys, listenToSpace, toggleSheet } from '../keys/game-keys.ts';
import { Sheets } from './sheet/PoppedSheets.tsx';
import { ClockBar } from './clock/ClockBar.tsx';
import { SidePanel } from './SidePanel.tsx';
import { TableReady } from './TableReady.tsx';
import { ContextMenu } from './ContextMenu.tsx';
import { blockNativeMenu } from '../keys/native-menu.ts';
import { ImageViewer } from './ImageViewer.tsx';
import { BuilderWindow } from './creator/BuilderWindow.tsx';
import { PileWindow } from './PileWindow.tsx';
import { InspectCard } from './InspectCard.tsx';
import { DiceOverlay } from './DiceOverlay.tsx';
import { Inspector } from './Inspector.tsx';
import { JournalViewer } from './JournalViewer.tsx';
import { AdventureBook } from './book/AdventureBook.tsx';
import { MapTools } from './MapTools.tsx';
import { PartyBar } from './PartyBar.tsx';
import { ObserveBanner } from './ObserveBanner.tsx';
import { PauseBanner, PauseButton } from './PauseBanner.tsx';
import { ReactionPrompt } from './ReactionPrompt.tsx';
import { RollDialog } from './RollDialog.tsx';
import { LevelPrompt } from './LevelPrompt.tsx';
import { TileQuestion } from './TileQuestion.tsx';
import { SceneNav } from './SceneNav.tsx';
import { TokenHud } from './TokenHud.tsx';
import { TurnOrder } from './TurnOrder.tsx';
import { useSession } from './useSession.ts';
import { SettingsMenu } from './SettingsMenu.tsx';
import { ClaudeKey } from './ClaudeKey.tsx';
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
    <div className="game has-[[data-slot=scene-nav]]:[&_.party]:top-[94px]!">
      <div className="map" ref={host} />
      {/* The top bar and the fight controls share one row, so neither can lie over the other. */}
      <div className="top-strip">
        <TopBar session={session} onLeave={onLeave} />
        <TurnOrder session={session} />
      </div>
      <SceneNav session={session} />
      <PartyBar session={session} />
      <MapTools session={session} />
      <Inspector session={session} />
      <JournalViewer session={session} />
      <AdventureBook session={session} />
      <ImageViewer session={session} />
      <PileWindow session={session} />
      <BuilderWindow session={session} />
      <InspectCard session={session} />
      <DiceOverlay session={session} />
      <ReactionPrompt session={session} />
      <RollDialog session={session} />
      <LevelPrompt session={session} />
      <TileQuestion session={session} />
      <ActionBar session={session} onSheet={() => toggleSheet(session)} />
      <Sheets session={session} />
      <SidePanel session={session} />
      <Toast session={session} />
      <ContextMenu session={session} />
      <TokenHud session={session} />
      <PauseBanner session={session} />
      <ObserveBanner session={session} />
      <TableReady key={session.scene} session={session} />
    </div>
  );
}

/** The bar across the top: connection, game and scene, clock, you, pause, undo, Claude, settings, leave. */
function TopBar({ session, onLeave }: Readonly<{ session: Session; onLeave: () => void }>) {
  return (
    <header className="topbar frame">
      <span
        className={`status status-${session.status}`}
        title={session.status === 'open' ? 'Connected' : session.status}
      />
      <strong className="world-name" title={session.world?.name}>
        {session.world?.name ?? 'Connecting…'}
      </strong>
      {session.scenes.name && <span className="scene-name">{session.scenes.name}</span>}
      <ClockBar session={session} />
      <span className="you" style={{ color: session.you?.color }}>
        {session.you?.name}
      </span>
      <PauseButton session={session} />
      <BookButton session={session} />
      <UndoButtons session={session} />
      <ThroughWallsButton session={session} />
      <View3DButton session={session} />
      {session.gameId && <ClaudeKey game={session.gameId} />}
      <SettingsMenu session={session} />
      <Button variant="ghost" size="icon-sm" onClick={onLeave} title={t('table.leave')} aria-label={t('table.leave')}>
        <LogOutIcon />
      </Button>
    </header>
  );
}

/** Opens the adventure book (J): quests, maps, lore, the party log. */
function BookButton({ session }: Readonly<{ session: Session }>) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-pressed={!!session.book.tab}
      onClick={() => session.book.toggle()}
      title={t('book.open')}
      aria-label={t('book.open')}
    >
      <BookOpenIcon />
    </Button>
  );
}

/** On a 3D scene, the GM lays the map flat to edit it and stands it up again (key V); nobody else has the button. */
function View3DButton({ session }: Readonly<{ session: Session }>) {
  if (!session.view3d.canFlip) return null;
  const on = session.view3d.on;
  const label = on ? t('view3d.flat') : t('view3d.stand');
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-pressed={!on}
      onClick={() => session.view3d.toggle()}
      title={label}
      aria-label={label}
    >
      {on ? <MapIcon /> : <BoxIcon />}
    </Button>
  );
}

/** The GM's "ignore walls" switch (Shift+W): creatures they move go straight through walls. */
function ThroughWallsButton({ session }: Readonly<{ session: Session }>) {
  if (!session.isGm()) return null;
  const on = session.throughWalls.on;
  const label = on ? t('walls.heed') : t('walls.ignore');
  return (
    <Button
      variant={on ? 'default' : 'ghost'}
      size="icon-sm"
      aria-pressed={on}
      onClick={() => session.throughWalls.toggle()}
      title={label}
      aria-label={t('walls.ghost')}
    >
      <GhostIcon />
    </Button>
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
  let off3d: (() => void) | undefined;
  void map.init(host).then(() => {
    if (!live) return;
    off3d = followView3d(session, map, host);
    session.connect();
  });
  return () => {
    live = false;
    off3d?.();
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
