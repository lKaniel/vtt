import { type GameDetail, newPlayerIssues, type Player, type Role, RoleSchema } from '@vtt/shared';
import { LockIcon, LockOpenIcon } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import { api } from '../server-api.ts';
import { ROLE_NAMES } from './role-names.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { SelectField } from './kit/select.tsx';

// Who gets in: a game's players (added by its GM, each with an optional
// password asked for on the join screen) and the server's admin password,
// which opens Setup.

type Seat = Pick<GameDetail['players'][number], 'id' | 'name' | 'locked'>;

/** A password on a player, or none: the GM's to set, or your own. */
export function PlayerPassword({
  game,
  player,
  onChanged,
}: Readonly<{ game: string; player: Seat; onChanged: () => void }>) {
  const [password, setPassword] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const save = async (next: string | null) => {
    try {
      await api.setPassword(game, player.id, next);
      setPassword('');
      setOpen(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const label = t(player.locked ? 'players.hasPassword' : 'players.setPasswordOf', { name: player.name });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} title={label}>
          {player.locked ? <LockIcon /> : <LockOpenIcon />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-[260px] flex-col gap-2" data-slot="player-password">
        <span className="text-sm">{t('players.passwordHint', { name: player.name })}</span>
        <Input
          type="password"
          autoComplete="new-password"
          aria-label={t('players.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && password && void save(password)}
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={!password} onClick={() => void save(password)}>
            {t('players.setPassword')}
          </Button>
          {player.locked && (
            <Button variant="outline" size="sm" onClick={() => void save(null)}>
              {t('players.removePassword')}
            </Button>
          )}
        </div>
        {error && <span className="menu-error">{error}</span>}
      </PopoverContent>
    </Popover>
  );
}

/** GM: a new player at the game, with a role and an optional password. */
export function AddPlayerForm({
  game,
  players,
  onAdded,
}: Readonly<{ game: string; players: readonly Pick<Player, 'name'>[]; onAdded: () => void }>) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('player');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const issues = newPlayerIssues(name, players as Player[]);
  const add = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    try {
      await api.addPlayer(game, { name, role, ...(password && { password }) });
      setName('');
      setPassword('');
      setError(undefined);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => void add(e)} data-slot="add-player">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-32 flex-1"
          aria-label={t('players.name')}
          placeholder={t('players.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <SelectField
          value={role}
          aria-label={t('players.role')}
          onValueChange={(r) => setRole(r as Role)}
          options={RoleSchema.options.map((r) => ({ value: r, label: ROLE_NAMES[r].name }))}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-32 flex-1"
          type="password"
          autoComplete="new-password"
          aria-label={t('players.passwordOptional')}
          placeholder={t('players.passwordOptional')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={issues.length > 0}>
          {t('players.add')}
        </Button>
      </div>
      {name.trim() && issues[0] && <p className="menu-error">{issues[0]}</p>}
      {error && <p className="menu-error">{error}</p>}
    </form>
  );
}

/** The admin password, which opens Setup on this browser. */
export function AdminUnlock({ onUnlocked }: Readonly<{ onUnlocked: () => Promise<void> }>) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const unlock = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    try {
      await api.unlockAdmin(password);
      await onUnlocked();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => void unlock(e)} data-slot="admin-unlock">
      <Input
        type="password"
        autoFocus
        autoComplete="current-password"
        aria-label={t('setup.adminPassword')}
        placeholder={t('setup.adminPassword')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" disabled={!password}>
        {t('setup.unlock')}
      </Button>
      {error && <span className="menu-error">{error}</span>}
    </form>
  );
}

/** Setup: a new admin password, or none. */
export function AdminPasswordForm({ has, onSaved }: Readonly<{ has: boolean; onSaved: () => Promise<void> }>) {
  const [password, setPassword] = useState('');
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();
  const save = async (next: string | null) => {
    try {
      await api.setAdminPassword(next);
      setPassword('');
      setError(undefined);
      setNote(t(next ? 'setup.passwordSaved' : 'setup.passwordRemoved'));
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form
      className="auth frame lobby-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save(password);
      }}
      data-slot="admin-password"
    >
      <h2 className="lobby-heading">{t('setup.adminPassword')}</h2>
      <p className="menu-note">{t(has ? 'setup.changeHint' : 'setup.setHint')}</p>
      <Input
        type="password"
        autoComplete="new-password"
        aria-label={t('setup.newAdminPassword')}
        placeholder={t('setup.newAdminPassword')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="auth-actions">
        <Button type="submit" variant="outline" disabled={!password}>
          {t(has ? 'setup.changePassword' : 'setup.setPassword')}
        </Button>
        {has && (
          <Button type="button" variant="ghost" onClick={() => void save(null)}>
            {t('setup.removePassword')}
          </Button>
        )}
      </div>
      {note && <p className="menu-note">{note}</p>}
      {error && <p className="menu-error">{error}</p>}
    </form>
  );
}
