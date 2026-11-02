import type { Character } from '@vtt/system-dnd5e';
import type { GameDetail, Role } from '@vtt/shared';
import { useCallback, useState } from 'react';
import { characterSummary } from '../creator.ts';
import { t } from '../i18n/index.ts';
import type { Route } from '../route.ts';
import { api } from '../server-api.ts';
import { CharactersPanel } from './CharactersPanel.tsx';
import { ClaudeKey } from './ClaudeKey.tsx';
import { AddPlayerForm, PlayerPassword } from './GameAccess.tsx';
import { BackupsPanel } from './GameArchive.tsx';
import { LobbyHead, systemLine, useLoad } from './LobbyScreens.tsx';
import { ROLE_NAMES } from './role-names.ts';
import { Button } from './kit/button.tsx';
import { SelectField } from './kit/select.tsx';

// One game's page: the door to the table with your characters there, and
// for its GM (or the server's admin) its players, backups and files.

type Go = (to: Route) => void;

const noCharacters = () => Promise.resolve([] as Character[]);

export function GamePage({ game: id, admin, go }: Readonly<{ game: string; admin: boolean; go: Go }>) {
  const load = useCallback(() => api.game(id), [id]);
  const { data: game, error, reload } = useLoad(load);
  const switchPlayer = async () => {
    await api.leave(id);
    go({ name: 'join', game: id });
  };
  return (
    <div className="account lobby" data-slot="game-page">
      <LobbyHead kicker={game ? systemLine(game) : t('menu.connecting')} title={game?.name ?? ''}>
        {game?.me && (
          <Button variant="outline" onClick={() => void switchPlayer()}>
            {t('game.switch')}
          </Button>
        )}
        <Button variant="outline" onClick={() => go({ name: 'menu' })}>
          {t('setup.games')}
        </Button>
      </LobbyHead>
      {error && <p className="menu-error">{error}</p>}
      {game && <GameBody game={game} admin={admin} go={go} onChanged={reload} />}
    </div>
  );
}

function GameBody({
  game,
  admin,
  go,
  onChanged,
}: Readonly<{ game: GameDetail; admin: boolean; go: Go; onChanged: () => void }>) {
  const { id, me } = game;
  const loadCharacters = useCallback(() => (me ? api.characters(id) : noCharacters()), [id, me]);
  const characters = useLoad(loadCharacters);
  const list = characters.data ?? [];
  return (
    <div className="lobby-body">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {me && <CharactersPanel game={id} characters={list} go={go} refresh={characters.reload} />}
        <Players game={game} onChanged={onChanged} />
      </div>
      <aside className="lobby-side">
        {me ? (
          <EnterGame game={game} characters={list} go={go} />
        ) : (
          <Button size="xl" onClick={() => go({ name: 'join', game: id })}>
            {t('game.join')}
          </Button>
        )}
        {me && <ClaudeKey game={id} />}
        {game.manage && <BackupsPanel game={game} />}
        {admin && !game.home && <DeleteGame game={game} onDeleted={() => go({ name: 'setup' })} />}
      </aside>
    </div>
  );
}

/** The game's players: the GM changes roles, passwords and who plays; anyone sets their own password. */
function Players({ game, onChanged }: Readonly<{ game: GameDetail; onChanged: () => void }>) {
  const [error, setError] = useState<string>();
  const run = async (step: Promise<unknown>) => {
    try {
      await step;
      setError(undefined);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const gms = game.players.filter((p) => p.role === 'gm').length;
  return (
    <section className="frame lobby-members" data-slot="players">
      <h2 className="lobby-heading">{t('players.title')}</h2>
      <ul className="lobby-member-list">
        {game.players.map((p) => (
          <PlayerRow
            key={p.id}
            p={p}
            game={game}
            lastGm={p.role === 'gm' && gms === 1}
            onRole={(role) => void run(api.setRole(game.id, p.id, role))}
            onRemove={() => void run(api.removePlayer(game.id, p.id))}
            onChanged={onChanged}
          />
        ))}
      </ul>
      {game.manage && <AddPlayerForm game={game.id} players={game.players} onAdded={onChanged} />}
      {game.manage && <p className="menu-note">{t('players.hint')}</p>}
      {error && <p className="menu-error">{error}</p>}
    </section>
  );
}

function PlayerRow({
  p,
  game,
  lastGm,
  onRole,
  onRemove,
  onChanged,
}: Readonly<{
  p: GameDetail['players'][number];
  game: GameDetail;
  lastGm: boolean;
  onRole: (role: Role) => void;
  onRemove: () => void;
  onChanged: () => void;
}>) {
  const self = p.id === game.me;
  const remove = () => {
    if (confirm(t('players.removeAsk', { name: p.name }))) onRemove();
  };
  return (
    <li className="lobby-member">
      <span
        className={p.online ? 'lobby-dot on' : 'lobby-dot'}
        title={t(p.online ? 'players.online' : 'players.away')}
      />
      <span className="lobby-member-name" style={{ color: p.color }}>
        {p.name}
        {self && ` ${t('players.you')}`}
      </span>
      <RoleField p={p} manage={game.manage} lastGm={lastGm} onChange={onRole} />
      {(game.manage || self) && <PlayerPassword game={game.id} player={p} onChanged={onChanged} />}
      {game.manage && !lastGm && (
        <Button variant="outline" size="sm" onClick={remove}>
          {t('players.remove')}
        </Button>
      )}
    </li>
  );
}

/** A player's role: a picker for the GM, plain text for everyone else. */
function RoleField({
  p,
  manage,
  lastGm,
  onChange,
}: Readonly<{ p: GameDetail['players'][number]; manage: boolean; lastGm: boolean; onChange: (role: Role) => void }>) {
  if (!manage) return <span className="menu-note">{ROLE_NAMES[p.role].name}</span>;
  return (
    <SelectField
      value={p.role}
      disabled={lastGm}
      title={lastGm ? t('players.needsGm') : undefined}
      aria-label={t('players.roleOf', { name: p.name })}
      onValueChange={(r) => onChange(r as Role)}
      options={Object.entries(ROLE_NAMES).map(([role, r]) => ({ value: role, label: r.name }))}
    />
  );
}

/** The door to the table, bringing one of your characters onto the map if you pick one. */
function EnterGame({ game, characters, go }: Readonly<{ game: GameDetail; characters: Character[]; go: Go }>) {
  const [picked, setPicked] = useState('');
  const [error, setError] = useState<string>();
  const me = game.players.find((p) => p.id === game.me);
  const enter = async () => {
    try {
      if (picked) await api.bring(game.id, picked);
      go({ name: 'play', game: game.id });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="auth frame lobby-form" data-slot="enter-game">
      <h2 className="lobby-heading">{t('game.enterAs', { name: me?.name ?? '' })}</h2>
      <label className="auth-field">
        <span>{t('game.bring')}</span>
        <SelectField
          className="w-full"
          value={picked}
          onValueChange={setPicked}
          options={[
            { value: '', label: t(game.you === 'gm' ? 'game.bringNoneGm' : 'game.bringNone') },
            ...characters.map((c) => ({ value: c.id, label: `${c.name}, ${characterSummary(c)}` })),
          ]}
        />
      </label>
      {error && <p className="menu-error">{error}</p>}
      <Button size="xl" onClick={() => void enter()}>
        {t('game.enter')}
      </Button>
    </div>
  );
}

function DeleteGame({ game, onDeleted }: Readonly<{ game: GameDetail; onDeleted: () => void }>) {
  const [error, setError] = useState<string>();
  const remove = async () => {
    if (!confirm(t('game.deleteAsk', { name: game.name }))) return;
    try {
      await api.deleteGame(game.id);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="lobby-danger">
      <Button variant="destructive" onClick={() => void remove()}>
        {t('game.delete')}
      </Button>
      {error && <p className="menu-error">{error}</p>}
    </div>
  );
}
