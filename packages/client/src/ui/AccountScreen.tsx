import { abilityScores, characterMaxHp, characterIssues, type Character } from '@vtt/shared';
import { useState } from 'react';
import { api, type SessionInfo } from '../account-api.ts';
import { characterSummary } from '../creator.ts';
import type { Route } from '../route.ts';

/** The signed-in player's home: their roster, and the door into the world. */
export function AccountScreen({
  info,
  characters,
  go,
  refresh,
}: Readonly<{ info: SessionInfo; characters: Character[]; go: (to: Route) => void; refresh: () => Promise<void> }>) {
  const [picked, setPicked] = useState(characters[0]?.id);
  const [error, setError] = useState<string>();
  const chosen = characters.find((c) => c.id === picked) ?? characters[0];
  const account = info.account!;

  const enter = async (character?: string) => {
    try {
      await api.join(character);
      go({ name: 'play' });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const signOut = async () => {
    await api.logout();
    await refresh();
    go({ name: 'menu' });
  };

  const remove = async (c: Character) => {
    if (!confirm(`Delete ${c.name} for good? Their token stays on the map.`)) return;
    await api.deleteCharacter(c.id);
    await refresh();
  };

  return (
    <div className="account">
      <header className="account-head">
        <div>
          <p className="menu-kicker">{info.world.name}</p>
          <h1 className="account-title">{account.name}&rsquo;s roster</h1>
        </div>
        <div className="account-actions">
          {info.seat && <span className="account-seat">Seated as {info.seat.role === 'gm' ? 'GM' : 'player'}</span>}
          <button className="btn" onClick={() => go({ name: 'menu' })}>
            Main menu
          </button>
          <button className="btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <div className="roster">
        {characters.map((c) => (
          <RosterCard key={c.id} c={c} on={c.id === chosen?.id} onPick={() => setPicked(c.id)} />
        ))}
        <button className="roster-card roster-new" onClick={() => go({ name: 'create' })}>
          <span className="roster-plus">+</span>
          <span>Create a character</span>
        </button>
      </div>

      {error && <p className="menu-error">{error}</p>}

      <footer className="account-foot frame">
        {chosen ? (
          <ChosenBar c={chosen} go={go} onEnter={() => void enter(chosen.id)} onDelete={() => void remove(chosen)} />
        ) : (
          <p className="account-empty">Create a character to bring to the table.</p>
        )}
        {(account.admin || info.seat?.role === 'gm') && (
          <button className="btn" onClick={() => void enter()}>
            Run the game as GM
          </button>
        )}
      </footer>
    </div>
  );
}

function RosterCard({ c, on, onPick }: Readonly<{ c: Character; on: boolean; onPick: () => void }>) {
  const scores = abilityScores(c);
  return (
    <button className={on ? 'roster-card on' : 'roster-card'} onClick={onPick} onDoubleClick={onPick}>
      <span
        className="roster-face"
        style={{ backgroundImage: `url(${c.img ?? '/art/ui/portrait-default.webp'})`, borderColor: c.color }}
      />
      <span className="roster-name">{c.name}</span>
      <span className="roster-line">{characterSummary(c)}</span>
      <span className="roster-stats">
        <span>HP {characterMaxHp(c)}</span>
        <span>STR {scores.str}</span>
        <span>DEX {scores.dex}</span>
        <span>CON {scores.con}</span>
      </span>
      <span className="roster-rules">{c.rules}</span>
    </button>
  );
}

function ChosenBar({
  c,
  go,
  onEnter,
  onDelete,
}: Readonly<{ c: Character; go: (to: Route) => void; onEnter: () => void; onDelete: () => void }>) {
  const broken = characterIssues(c);
  return (
    <div className="chosen">
      <div className="chosen-who">
        <strong>{c.name}</strong>
        <span>{characterSummary(c)}</span>
        {broken.length > 0 && <span className="chosen-warn">{broken[0]}</span>}
      </div>
      <button className="btn danger" onClick={onDelete}>
        Delete
      </button>
      <button className="btn" onClick={() => go({ name: 'create', id: c.id })}>
        Edit
      </button>
      <button className="btn" disabled={c.level >= 20} onClick={() => go({ name: 'levelup', id: c.id })}>
        Level up
      </button>
      <button className="btn primary" onClick={onEnter}>
        Enter the world
      </button>
    </div>
  );
}
