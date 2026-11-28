import type { Character } from '@vtt/system-dnd5e';
import { type GameDetail, isGm, type Role } from '@vtt/shared';
import { useCallback, useState } from 'react';
import { characterSummary } from '../content/creator.ts';
import { bringFirst } from '../lobby.ts';
import { t } from '../i18n/index.ts';
import type { Route } from '../route.ts';
import { api } from '../server-api.ts';
import { CharactersPanel } from './CharactersPanel.tsx';
import { AddPlayerForm, PlayerPassword } from './GameAccess.tsx';
import { BackupsPanel } from './GameArchive.tsx';
import { CopyInvite, InviteBox } from './InviteLinks.tsx';
import { LobbyHead, systemLine } from './LobbyScreens.tsx';
import { useLoad } from './useLoad.ts';
import { ROLE_NAMES } from './role-names.ts';
import { cn } from '@/lib/utils';
import { Button } from './kit/button.tsx';
import { SelectField } from './kit/select.tsx';
import { CardTitle } from './kit/card.tsx';

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
    <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-[22px] max-[860px]:grid-cols-1">
      <div className={`flex min-w-0 flex-1 gap-4 ${game.manage ? 'flex-col-reverse justify-end' : 'flex-col'}`}>
        {me && <CharactersPanel game={id} characters={list} go={go} refresh={characters.reload} />}
        <Players game={game} onChanged={onChanged} />
      </div>
      <aside className="grid gap-[18px]">
        {me ? (
          <EnterGame key={list.map((c) => c.id).join()} game={game} characters={list} go={go} />
        ) : (
          <Button size="xl" onClick={() => go({ name: 'join', game: id })}>
            {t('game.join')}
          </Button>
        )}
        {game.manage && (
          <BackupsPanel
            game={game}
            onRestored={() => {
              onChanged();
              characters.reload();
            }}
          />
        )}
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
    <section className="frame grid gap-3 px-[22px] py-5" data-slot="players">
      <CardTitle>{t('players.title')}</CardTitle>
      {game.manage && <InviteBox game={game.id} />}
      <ul className="m-0 grid list-none gap-2 p-0">
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
    <li className="flex items-center gap-3 rounded-[4px] border border-[rgba(168,138,94,0.25)] bg-black/30 px-2.5 py-2">
      <span
        className={cn('size-2.5 rounded-full bg-[#555]', p.online && 'bg-[#7cc47c] shadow-[0_0_6px_#7cc47c]')}
        title={t(p.online ? 'players.online' : 'players.away')}
      />
      <span className="flex-1 font-display text-lg" style={{ color: p.color }}>
        {p.name}
        {self && ` ${t('players.you')}`}
      </span>
      <RoleField p={p} manage={game.manage} lastGm={lastGm} onChange={onRole} />
      {game.manage && !self && <CopyInvite game={game.id} player={p} />}
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
  const [picked, setPicked] = useState(() => bringFirst(game.you, characters));
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
    <div className="auth frame px-[22px] py-5" data-slot="enter-game">
      <CardTitle>{t('game.enterAs', { name: me?.name ?? '' })}</CardTitle>
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
      {!characters.length && game.you !== null && !isGm({ role: game.you }) && (
        <p className="menu-note">{t('game.noCharacterYet')}</p>
      )}
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
    <div className="grid justify-items-end">
      <Button variant="destructive" onClick={() => void remove()}>
        {t('game.delete')}
      </Button>
      {error && <p className="menu-error">{error}</p>}
    </div>
  );
}
