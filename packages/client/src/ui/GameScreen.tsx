import { useEffect, useRef, useState } from 'react';
import { MapView } from '../canvas/MapView.ts';
import { hotbarTiles } from '../hotbar.ts';
import { Session } from '../session.ts';
import { stepTarget } from '../stepping.ts';
import { activateTile, ActionBar, canActivate } from './ActionBar.tsx';
import { CharacterSheet } from './CharacterSheet.tsx';
import { ChatPanel } from './ChatPanel.tsx';
import { MapTools } from './MapTools.tsx';
import { PartyBar } from './PartyBar.tsx';
import { TurnOrder } from './TurnOrder.tsx';
import { useSession } from './useSession.ts';

export function GameScreen({ playerId, onLeave }: Readonly<{ playerId: string; onLeave: () => void }>) {
  const [session] = useState(() => new Session(playerId));
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
      if (isTyping(e.target)) return;
      if (e.key === 'Escape' && session.mapTool) session.setMapTool(undefined);
      else if (e.key === 'c') toggleSheet(session);
      else if (e.key === 'e') toggleEditor(session);
      else handleGameKey(session, e);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [session]);

  return (
    <div className="game">
      <div className="map" ref={host} />
      <header className="topbar frame">
        <span
          className={`status status-${session.status}`}
          title={session.status === 'open' ? 'Connected' : session.status}
        />
        <strong className="world-name">{session.world?.name ?? 'Connecting…'}</strong>
        <span className="you" style={{ color: session.you?.color }}>
          {session.you?.name}
        </span>
        <button className="link" onClick={onLeave}>
          Change seat
        </button>
      </header>
      <TurnOrder session={session} onStart={() => session.startCombat(session.fightersInView())} />
      <PartyBar session={session} />
      <MapTools session={session} />
      <ActionBar session={session} onSheet={() => toggleSheet(session)} />
      <CharacterSheet session={session} />
      <ChatPanel session={session} />
      <Toast session={session} />
    </div>
  );
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
  );
}

/** C opens the selected creature's sheet, or closes the open one. */
function toggleSheet(session: Session): void {
  if (session.sheet) session.openSheet(undefined);
  else if (session.selected) session.openSheet({ kind: 'token', id: session.selected });
}

/** GM: E switches the open sheet to edit mode and back, or opens the selected creature's sheet for editing. */
function toggleEditor(session: Session): void {
  if (session.you?.role !== 'gm') return;
  if (session.sheet) session.setSheetEdit(!session.sheet.edit);
  else if (session.selected) session.openSheet({ kind: 'token', id: session.selected }, true);
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
  return <div className="toast">{error.message}</div>;
}
