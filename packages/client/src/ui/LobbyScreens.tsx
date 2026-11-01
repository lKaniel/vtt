import { newGameIssues, systemOf, type Edition, type GameSummary, type SystemInfo } from '@vtt/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type Account } from '../account-api.ts';
import { inviteCode, lastPlayedText, PENDING_INVITE } from '../lobby.ts';
import type { Route } from '../route.ts';
import { ROLE_NAMES } from './PlayersTab.tsx';

// The lobby: the games you can enter, making a game, joining by invite, and
// each game's page with its members and the door to the table.

type Go = (to: Route) => void;

/** Loads something for a screen, with the error to show and a way to load it again. */
export function useLoad<T>(load: () => Promise<T>): { data?: T; error?: string; reload: () => void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const reload = useCallback(() => {
    load().then(
      (d) => {
        setData(d);
        setError(undefined);
      },
      (e: unknown) => setError((e as Error).message),
    );
  }, [load]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

export function LobbyHead({
  kicker,
  title,
  children,
}: Readonly<{ kicker: string; title: string; children: ReactNode }>) {
  return (
    <header className="account-head">
      <div>
        <p className="menu-kicker">{kicker}</p>
        <h1 className="account-title">{title}</h1>
      </div>
      <div className="account-actions">{children}</div>
    </header>
  );
}

export const systemLine = (g: { system: string; rules: Edition }, systems: readonly SystemInfo[] = []) => {
  const system = systems.find((s) => s.id === g.system) ?? systemOf(g.system);
  return `${system?.name ?? g.system}, ${g.rules} rules`;
};

/** Your games, a new game, and joining one by its invite link. */
export function GamesScreen({ account, go }: Readonly<{ account: Account; go: Go }>) {
  const { data, error, reload } = useLoad(api.games);
  const [now] = useState(() => Date.now());
  return (
    <div className="account lobby">
      <LobbyHead kicker={`Signed in as ${account.name}`} title="Your games">
        <button className="btn" onClick={() => go({ name: 'account' })}>
          Your characters
        </button>
        <button className="btn" onClick={() => go({ name: 'menu' })}>
          Main menu
        </button>
      </LobbyHead>
      {error && <p className="menu-error">{error}</p>}
      <div className="lobby-body">
        <div className="roster lobby-games">
          {data?.games.map((g) => (
            <GameCard key={g.id} g={g} systems={data.systems} now={now} onOpen={() => go({ name: 'game', id: g.id })} />
          ))}
          {data && !data.games.length && <p className="account-empty">No games yet: make one, or join by invite.</p>}
        </div>
        <aside className="lobby-side">
          {data && <NewGameForm systems={data.systems} onMade={(id) => go({ name: 'game', id })} />}
          <JoinByInvite go={go} onJoined={reload} />
        </aside>
      </div>
    </div>
  );
}

/** Your place in a game, for its card. */
function standing(g: GameSummary): string {
  if (g.you) return ROLE_NAMES[g.you].name;
  return g.open ? 'Open to everyone' : 'Not a member';
}

function GameCard({
  g,
  systems,
  now,
  onOpen,
}: Readonly<{ g: GameSummary; systems: SystemInfo[]; now: number; onOpen: () => void }>) {
  return (
    <button className="roster-card lobby-card" onClick={onOpen}>
      <span className="roster-name">{g.name}</span>
      <span className="roster-line">{systemLine(g, systems)}</span>
      <span className="roster-stats">
        <span>{standing(g)}</span>
        <span>
          {g.members} member{g.members === 1 ? '' : 's'}
        </span>
        {g.online > 0 && <span className="lobby-online">{g.online} playing now</span>}
      </span>
      <span className="menu-note">{lastPlayedText(g.lastPlayed, now)}</span>
      {g.home && <span className="roster-rules">server game</span>}
    </button>
  );
}

function NewGameForm({ systems, onMade }: Readonly<{ systems: SystemInfo[]; onMade: (id: string) => void }>) {
  const [name, setName] = useState('');
  const [system, setSystem] = useState(systems[0]?.id ?? '');
  const editions = systems.find((s) => s.id === system)?.editions ?? [];
  const [rules, setRules] = useState<Edition>(editions[0]?.id ?? '2014');
  const [error, setError] = useState<string>();
  const issues = newGameIssues({ name, system, rules });

  const create = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    try {
      onMade((await api.createGame({ name, system, rules })).id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form className="auth frame lobby-form" onSubmit={(e) => void create(e)}>
      <h2 className="lobby-heading">New game</h2>
      <label className="auth-field">
        <span>Name</span>
        <input value={name} placeholder="The Lost Mine" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="auth-field">
        <span>System</span>
        <select value={system} onChange={(e) => setSystem(e.target.value)}>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="auth-field">
        <span>Rules</span>
        <select value={rules} onChange={(e) => setRules(e.target.value as Edition)}>
          {editions.map((ed) => (
            <option key={ed.id} value={ed.id}>
              {ed.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="menu-error">{error}</p>}
      <button type="submit" className="btn primary" disabled={issues.length > 0}>
        Create game
      </button>
    </form>
  );
}

function JoinByInvite({ go, onJoined }: Readonly<{ go: Go; onJoined: () => void }>) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const join = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    try {
      const id = await api.acceptInvite(inviteCode(text));
      onJoined();
      go({ name: 'game', id });
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form className="auth frame lobby-form" onSubmit={(e) => void join(e)}>
      <h2 className="lobby-heading">Join a game</h2>
      <label className="auth-field">
        <span>Invite link or code</span>
        <input value={text} placeholder="Paste what the GM sent you" onChange={(e) => setText(e.target.value)} />
      </label>
      {error && <p className="menu-error">{error}</p>}
      <button type="submit" className="btn" disabled={!inviteCode(text)}>
        Join
      </button>
    </form>
  );
}

/** An invite link: joins once signed in, else asks to sign in first and comes back. */
export function InviteScreen({ code, signedIn, go }: Readonly<{ code: string; signedIn: boolean; go: Go }>) {
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!signedIn) {
      sessionStorage.setItem(PENDING_INVITE, code);
      return;
    }
    sessionStorage.removeItem(PENDING_INVITE);
    api.acceptInvite(code).then(
      (id) => go({ name: 'game', id }),
      (e: unknown) => setError((e as Error).message),
    );
  }, [code, signedIn, go]);
  return (
    <div className="menu">
      <h1 className="menu-title">You are invited</h1>
      {error && <p className="menu-error">{error}</p>}
      {!signedIn && (
        <nav className="menu-list">
          <p className="menu-note">Sign in or make an account, and you will join the game.</p>
          <button className="menu-button primary" onClick={() => go({ name: 'login' })}>
            Sign in
          </button>
          <button className="menu-button" onClick={() => go({ name: 'register' })}>
            Create an account
          </button>
        </nav>
      )}
      {signedIn && !error && <p className="menu-note">Joining…</p>}
      {error && (
        <button className="btn menu-back" onClick={() => go({ name: 'games' })}>
          Your games
        </button>
      )}
    </div>
  );
}
