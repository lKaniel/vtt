import type { Player } from '@vtt/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { api, type SessionInfo } from '../account-api.ts';
import type { Route } from '../route.ts';
import { ROLE_NAMES } from './PlayersTab.tsx';
import { rememberSeatKey } from '../seat-key.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';

/** The tavern backdrop with a centred column, shared by the menu screens. */
function MenuShell({ title, children, wide }: Readonly<{ title: string; children: ReactNode; wide?: boolean }>) {
  return (
    <div className={wide ? 'menu menu-wide' : 'menu'}>
      <h1 className="menu-title">{title}</h1>
      {children}
    </div>
  );
}

export function MainMenu({
  info,
  error,
  go,
  characters = 0,
}: Readonly<{ info?: SessionInfo; error?: string; go: (to: Route) => void; characters?: number }>) {
  const account = info?.account;
  return (
    <div className="menu main-menu">
      <div className="menu-crest">
        <p className="menu-kicker">Gather at the table</p>
        <h1 className="menu-logo">{info ? (info.home?.name ?? 'The table') : 'Connecting…'}</h1>
      </div>
      {error && <p className="menu-error">{error}</p>}
      <nav className="menu-list">
        {account ? (
          <>
            <MenuButton primary onClick={() => go({ name: 'games' })}>
              Your games, {account.name}
            </MenuButton>
            <MenuButton onClick={() => go({ name: 'account' })}>Your characters</MenuButton>
            <MenuButton onClick={() => go({ name: 'create' })}>New character</MenuButton>
            <p className="menu-note">
              {characters} character{characters === 1 ? '' : 's'} in your roster
            </p>
          </>
        ) : (
          <>
            <MenuButton primary onClick={() => go({ name: 'login' })}>
              Sign in
            </MenuButton>
            <MenuButton onClick={() => go({ name: 'register' })}>Create an account</MenuButton>
          </>
        )}
        <MenuButton onClick={() => go({ name: 'seats' })}>Take a seat without an account</MenuButton>
      </nav>
    </div>
  );
}

function MenuButton({
  children,
  onClick,
  primary,
}: Readonly<{ children: ReactNode; onClick: () => void; primary?: boolean }>) {
  return (
    <Button variant={primary ? 'default' : 'menu'} size="xl" onClick={onClick}>
      {children}
    </Button>
  );
}

export function AuthScreen({
  mode,
  go,
  onSignedIn,
}: Readonly<{ mode: 'login' | 'register'; go: (to: Route) => void; onSignedIn: () => void }>) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const register = mode === 'register';

  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (register) await api.register(username, password, name);
      else await api.login(username, password);
      onSignedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MenuShell title={register ? 'Create an account' : 'Sign in'}>
      <form className="auth frame" onSubmit={(e) => void submit(e)}>
        <label className="auth-field">
          <span>Username</span>
          <Input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        {register && (
          <label className="auth-field">
            <span>Name at the table</span>
            <Input value={name} placeholder="What others see" onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label className="auth-field">
          <span>Password</span>
          <Input
            type="password"
            autoComplete={register ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="menu-error">{error}</p>}
        <div className="auth-actions">
          <Button type="button" variant="outline" onClick={() => go({ name: 'menu' })}>
            Back
          </Button>
          <Button type="submit" disabled={busy || !username || !password}>
            {register ? 'Create account' : 'Sign in'}
          </Button>
        </div>
        <Button
          type="button"
          variant="link"
          className="auth-switch"
          onClick={() => go({ name: register ? 'login' : 'register' })}
        >
          {register ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </Button>
      </form>
    </MenuShell>
  );
}

/** The home game's fixed seats: the old way in, for quick games and testing. */
export function SeatsScreen({ go, onJoin }: Readonly<{ go: (to: Route) => void; onJoin: (id: string) => void }>) {
  const [players, setPlayers] = useState<(Player & { locked?: boolean })[]>();
  const [error, setError] = useState<string>();
  const [asking, setAsking] = useState<Player>();

  useEffect(() => {
    fetch('/api/players')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(setPlayers)
      .catch(() => setError("Can't reach the game server. Is it running?"));
  }, []);

  return (
    <MenuShell title="Pick your seat">
      {error && <p className="menu-error">{error}</p>}
      <div className="join-list">
        {players?.map((p) => (
          <button
            key={p.id}
            className="join-seat"
            style={{ borderColor: p.color }}
            onClick={() => (p.locked ? setAsking(p) : onJoin(p.id))}
          >
            <span className="join-name">{p.name}</span>
            <span className="join-role">
              {ROLE_NAMES[p.role].name}
              {p.locked && ' · password'}
            </span>
          </button>
        ))}
      </div>
      {asking && <SeatKeyForm seat={asking} onJoin={onJoin} />}
      <Button variant="outline" className="menu-back" onClick={() => go({ name: 'menu' })}>
        Back
      </Button>
    </MenuShell>
  );
}

/** The password of a locked seat, kept for this tab and sent as it connects (seat-key.ts). */
function SeatKeyForm({ seat, onJoin }: Readonly<{ seat: Player; onJoin: (id: string) => void }>) {
  const [key, setKey] = useState('');
  const sit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    rememberSeatKey(seat.id, key);
    onJoin(seat.id);
  };
  return (
    <form className="auth frame" onSubmit={sit} data-slot="seat-key">
      <label className="auth-field">
        <span>{seat.name}'s password</span>
        <Input type="password" autoFocus value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      <Button type="submit" disabled={!key}>
        Take the seat
      </Button>
    </form>
  );
}
