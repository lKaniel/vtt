import { abilityScores, type Character, characterIssues, characterMaxHp } from '@vtt/system-dnd5e';
import { useState } from 'react';
import { api, type SessionInfo } from '../account-api.ts';
import { characterSummary } from '../creator.ts';
import type { Route } from '../route.ts';
import { Button } from './kit/button.tsx';

/** The signed-in player's roster; games are entered from the lobby (LobbyScreens.tsx). */
export function AccountScreen({
  info,
  characters,
  go,
  refresh,
}: Readonly<{ info: SessionInfo; characters: Character[]; go: (to: Route) => void; refresh: () => Promise<void> }>) {
  const [picked, setPicked] = useState(characters[0]?.id);
  const chosen = characters.find((c) => c.id === picked) ?? characters[0];
  const account = info.account!;

  const signOut = async () => {
    await api.logout();
    await refresh();
    go({ name: 'menu' });
  };

  const remove = async (c: Character) => {
    if (!confirm(`Delete ${c.name} for good? Their tokens stay in the games they joined.`)) return;
    await api.deleteCharacter(c.id);
    await refresh();
  };

  return (
    <div className="account">
      <header className="account-head">
        <div>
          <p className="menu-kicker">Your characters travel with you to every game</p>
          <h1 className="account-title">{account.name}&rsquo;s roster</h1>
        </div>
        <div className="account-actions">
          <Button onClick={() => go({ name: 'games' })}>Your games</Button>
          <Button variant="outline" onClick={() => go({ name: 'menu' })}>
            Main menu
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
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

      <footer className="account-foot frame">
        {chosen ? (
          <ChosenBar c={chosen} go={go} onDelete={() => void remove(chosen)} />
        ) : (
          <p className="account-empty">Create a character to bring to the table.</p>
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

function ChosenBar({ c, go, onDelete }: Readonly<{ c: Character; go: (to: Route) => void; onDelete: () => void }>) {
  const broken = characterIssues(c);
  return (
    <div className="chosen">
      <div className="chosen-who">
        <strong>{c.name}</strong>
        <span>{characterSummary(c)}</span>
        {broken.length > 0 && <span className="chosen-warn">{broken[0]}</span>}
      </div>
      <Button variant="destructive" onClick={onDelete}>
        Delete
      </Button>
      <Button variant="outline" onClick={() => go({ name: 'create', id: c.id })}>
        Edit
      </Button>
      <Button variant="outline" disabled={c.level >= 20} onClick={() => go({ name: 'levelup', id: c.id })}>
        Level up
      </Button>
    </div>
  );
}
