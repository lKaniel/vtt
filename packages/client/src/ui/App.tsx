import type { Player } from '@vtt/shared';
import { useEffect, useState } from 'react';
import { GameScreen } from './GameScreen.tsx';

export function App() {
  const [playerId, setPlayerId] = useState(() => new URLSearchParams(location.search).get('player'));

  const choose = (id: string | null) => {
    const url = new URL(location.href);
    if (id) url.searchParams.set('player', id);
    else url.searchParams.delete('player');
    history.replaceState(null, '', url);
    setPlayerId(id);
  };

  return playerId ? <GameScreen playerId={playerId} onLeave={() => choose(null)} /> : <JoinScreen onJoin={choose} />;
}

function JoinScreen({ onJoin }: Readonly<{ onJoin: (id: string) => void }>) {
  const [players, setPlayers] = useState<Player[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    fetch('/api/players')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(setPlayers)
      .catch(() => setError("Can't reach the game server. Is it running?"));
  }, []);

  return (
    <div className="join">
      <h1>Pick your seat</h1>
      {error && <p className="join-error">{error}</p>}
      <div className="join-list">
        {players?.map((p) => (
          <button key={p.id} className="join-seat" style={{ borderColor: p.color }} onClick={() => onJoin(p.id)}>
            <span className="join-name">{p.name}</span>
            <span className="join-role">{p.role === 'gm' ? 'Game master' : 'Player'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
