import { useEffect, useRef, useState } from 'react';
import { actionTiles } from '../actions.ts';
import { MapView } from '../canvas/MapView.ts';
import { Session } from '../session.ts';
import { activateTile, ActionBar } from './ActionBar.tsx';
import { CharacterSheet } from './CharacterSheet.tsx';
import { ChatPanel } from './ChatPanel.tsx';
import { PartyBar } from './PartyBar.tsx';
import { TurnOrder } from './TurnOrder.tsx';
import { useSession } from './useSession.ts';

export function GameScreen({ playerId, onLeave }: Readonly<{ playerId: string; onLeave: () => void }>) {
  const [session] = useState(() => new Session(playerId));
  const [sheetOpen, setSheetOpen] = useState(false);
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
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'c') setSheetOpen((open) => !open);
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
      <ActionBar session={session} onSheet={() => setSheetOpen((open) => !open)} />
      {sheetOpen && <CharacterSheet session={session} onClose={() => setSheetOpen(false)} />}
      <ChatPanel session={session} />
      <Toast session={session} />
    </div>
  );
}

/** Esc backs out, 1-0 use the action bar's tiles, Space ends your turn. */
function handleGameKey(session: Session, e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (session.armed ?? session.aiming) session.arm(undefined);
    else session.select(undefined);
    return;
  }
  if (e.key === ' ' && session.isMyTurn()) {
    e.preventDefault();
    session.endTurn();
    return;
  }
  const token = session.selected ? session.tokens.get(session.selected) : undefined;
  const tile = token && actionTiles(token).find((t) => t.hotkey === e.key);
  if (token && tile && !tile.spent) activateTile(session, token, tile);
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
