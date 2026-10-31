import { useEffect, useRef, useState } from 'react';
import { MapView } from '../canvas/MapView.ts';
import { Session } from '../session.ts';
import { CharacterSheet } from './CharacterSheet.tsx';
import { ChatPanel } from './ChatPanel.tsx';
import { Hotbar } from './Hotbar.tsx';
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
      <header className="topbar">
        <strong>{session.world?.name ?? 'Connecting…'}</strong>
        <span className={`status status-${session.status}`}>
          {session.status === 'open' ? 'connected' : session.status}
        </span>
        <span className="you" style={{ color: session.you?.color }}>
          {session.you?.name}
        </span>
        <button className="link" onClick={onLeave}>
          Change seat
        </button>
      </header>
      <TurnOrder session={session} onStart={() => session.startCombat(session.fightersInView())} />
      <PartyBar session={session} />
      <Hotbar session={session} onSheet={() => setSheetOpen((open) => !open)} />
      {sheetOpen && <CharacterSheet session={session} onClose={() => setSheetOpen(false)} />}
      <ChatPanel session={session} />
      <Toast session={session} />
    </div>
  );
}

/** Esc backs out, 1-8 ready an attack, Space ends your turn. */
function handleGameKey(session: Session, e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (session.armed) session.arm(undefined);
    else session.select(undefined);
    return;
  }
  if (e.key === ' ' && session.isMyTurn()) {
    e.preventDefault();
    session.endTurn();
    return;
  }
  const slot = Number(e.key) - 1;
  const token = session.selected ? session.tokens.get(session.selected) : undefined;
  const attack = Number.isInteger(slot) ? token?.sheet?.attacks[slot] : undefined;
  if (attack) session.arm(session.armed === attack.name ? undefined : attack.name);
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
