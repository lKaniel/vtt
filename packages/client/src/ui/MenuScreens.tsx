import type { GameDetail } from '@vtt/shared';
import { LockIcon } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { t } from '../i18n/index.ts';
import { gameRoute } from '../lobby.ts';
import type { Route } from '../route.ts';
import { api, type SessionInfo } from '../server-api.ts';
import { GameCard, useLoad } from './LobbyScreens.tsx';
import { ROLE_NAMES } from './role-names.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { SelectField } from './kit/select.tsx';

// The way in, Foundry style: the games on this server, and each game's join
// screen, where you pick your player (and give its password, if it has one).
// Making and importing games is Setup's (LobbyScreens.tsx).

type Go = (to: Route) => void;

/** The tavern backdrop with a centred column. */
function MenuShell({ title, kicker, children }: Readonly<{ title: string; kicker?: string; children: ReactNode }>) {
  return (
    <div className="menu">
      {kicker && <p className="menu-kicker text-center">{kicker}</p>}
      <h1 className="menu-title">{title}</h1>
      {children}
    </div>
  );
}

/** The games on this server: pick one to join it, or go to Setup. */
export function MainMenu({ info, error, go }: Readonly<{ info?: SessionInfo; error?: string; go: Go }>) {
  const { data, error: loadError } = useLoad(api.games);
  const [now] = useState(() => Date.now());
  return (
    <div className="menu main-menu mx-auto" data-slot="main-menu">
      <div className="menu-crest">
        <p className="menu-kicker">{t('menu.kicker')}</p>
        <h1 className="menu-logo">{info ? (info.home?.name ?? t('menu.table')) : t('menu.connecting')}</h1>
      </div>
      {(error ?? loadError) && <p className="menu-error">{error ?? loadError}</p>}
      <div className="roster lobby-games justify-center">
        {data?.games.map((g) => (
          <GameCard key={g.id} g={g} now={now} onOpen={() => go(gameRoute(g))} />
        ))}
        {data && !data.games.length && <p className="account-empty">{t('menu.noGames')}</p>}
      </div>
      <nav className="menu-list">
        <Button variant="menu" size="xl" onClick={() => go({ name: 'setup' })}>
          {t('menu.setup')}
        </Button>
      </nav>
    </div>
  );
}

/** A game's join screen: pick your player, give its password if it has one, and in you go. */
export function JoinScreen({ game: id, go }: Readonly<{ game: string; go: Go }>) {
  const load = useCallback(() => api.game(id), [id]);
  const { data: game, error } = useLoad(load);
  return (
    <MenuShell title={game?.name ?? t('menu.connecting')} kicker={t('join.kicker')}>
      {error && <p className="menu-error">{error}</p>}
      {game && <JoinForm game={game} onJoined={() => go({ name: 'game', game: game.id })} />}
      <Button variant="outline" className="menu-back mx-auto mt-[18px] flex" onClick={() => go({ name: 'menu' })}>
        {t('join.back')}
      </Button>
    </MenuShell>
  );
}

function JoinForm({ game, onJoined }: Readonly<{ game: GameDetail; onJoined: () => void }>) {
  const [player, setPlayer] = useState(game.me ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const picked = game.players.find((p) => p.id === player);
  const join = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.join(game.id, player, password);
      onJoined();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <form className="auth frame" onSubmit={(e) => void join(e)} data-slot="join-form">
      {game.me && <p className="menu-note">{t('join.joinedAs', { name: nameOf(game, game.me) })}</p>}
      <label className="auth-field">
        <span>{t('join.player')}</span>
        <SelectField
          className="w-full"
          value={player}
          placeholder={t('join.pick')}
          aria-label={t('join.player')}
          onValueChange={(v) => {
            setPlayer(v);
            setError(undefined);
          }}
          options={game.players.map((p) => ({
            value: p.id,
            label: (
              <span className="flex items-center gap-2">
                <span style={{ color: p.color }}>{p.name}</span>
                <span className="muted">{ROLE_NAMES[p.role].name}</span>
                {p.locked && <LockIcon className="size-3" aria-label={t('join.locked')} />}
              </span>
            ),
          }))}
        />
      </label>
      {picked?.locked && (
        <label className="auth-field">
          <span className="flex items-center gap-1">
            <LockIcon className="size-3" /> {t('join.password')}
          </span>
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      {error && <p className="menu-error">{error}</p>}
      <Button type="submit" disabled={busy || !picked || (picked.locked && !password)}>
        {t('join.join')}
      </Button>
      {!game.players.length && <p className="menu-note">{t('join.noPlayers')}</p>}
    </form>
  );
}

const nameOf = (game: GameDetail, id: string) => game.players.find((p) => p.id === id)?.name ?? id;
