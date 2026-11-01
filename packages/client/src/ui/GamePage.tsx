import type { Character } from '@vtt/system-dnd5e';
import type { GameDetail, Role } from '@vtt/shared';
import { useCallback, useState } from 'react';
import { api, type Account } from '../account-api.ts';
import { characterSummary } from '../creator.ts';
import { inviteLink } from '../lobby.ts';
import type { Route } from '../route.ts';
import { LobbyHead, systemLine, useLoad } from './LobbyScreens.tsx';
import { ROLE_NAMES } from './PlayersTab.tsx';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { SelectField } from './kit/select.tsx';
import { Checkbox } from './kit/checkbox.tsx';

// One game's page in the lobby: its members and their roles, the invite
// link, and the door to the table.

type Go = (to: Route) => void;

/** One game: who is in it, its invite link, and entering it with a character. */
export function GamePage({
  id,
  account,
  characters,
  go,
}: Readonly<{ id: string; account: Account; characters: Character[]; go: Go }>) {
  const load = useCallback(() => api.game(id), [id]);
  const { data: game, error, reload } = useLoad(load);
  const gm = game?.you === 'gm';
  return (
    <div className="account lobby">
      <LobbyHead kicker={game ? systemLine(game) : 'Loading…'} title={game?.name ?? ''}>
        <Button variant="outline" onClick={() => go({ name: 'games' })}>
          All games
        </Button>
      </LobbyHead>
      {error && <p className="menu-error">{error}</p>}
      {game && (
        <div className="lobby-body">
          <Members game={game} account={account} onChanged={reload} onLeft={() => go({ name: 'games' })} />
          <aside className="lobby-side">
            <EnterGame game={game} characters={characters} go={go} />
            {gm && <InvitePanel game={game} onChanged={reload} />}
            {(gm || account.admin) && !game.home && <DeleteGame game={game} onDeleted={() => go({ name: 'games' })} />}
          </aside>
        </div>
      )}
    </div>
  );
}

function Members({
  game,
  account,
  onChanged,
  onLeft,
}: Readonly<{ game: GameDetail; account: Account; onChanged: () => void; onLeft: () => void }>) {
  const [error, setError] = useState<string>();
  const change = async (member: string, role: Role | null) => {
    try {
      await api.setMember(game.id, member, role);
      if (member === account.id && !role) onLeft();
      else onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="frame lobby-members">
      <h2 className="lobby-heading">At the table</h2>
      <ul className="lobby-member-list">
        {game.players.map((p) => (
          <MemberRow key={p.id} p={p} game={game} me={account.id} onChange={(role) => void change(p.id, role)} />
        ))}
      </ul>
      {error && <p className="menu-error">{error}</p>}
    </section>
  );
}

function MemberRow({
  p,
  game,
  me,
  onChange,
}: Readonly<{
  p: GameDetail['players'][number];
  game: GameDetail;
  me: string;
  onChange: (role: Role | null) => void;
}>) {
  const gm = game.you === 'gm';
  const self = p.id === me;
  // A game always keeps a GM: the only one can't step down or leave.
  const lastGm = p.role === 'gm' && game.players.filter((x) => x.role === 'gm').length === 1;
  return (
    <li className="lobby-member">
      <span className={p.online ? 'lobby-dot on' : 'lobby-dot'} title={p.online ? 'Playing now' : 'Away'} />
      <span className="lobby-member-name" style={{ color: p.color }}>
        {p.name}
        {self && ' (you)'}
      </span>
      {gm ? (
        <SelectField
          value={p.role}
          disabled={lastGm}
          title={lastGm ? 'The game needs a GM' : undefined}
          aria-label={`${p.name}'s role`}
          onValueChange={(r) => onChange(r as Role)}
          options={Object.entries(ROLE_NAMES).map(([role, r]) => ({ value: role, label: r.name }))}
        />
      ) : (
        <span className="menu-note">{ROLE_NAMES[p.role].name}</span>
      )}
      {(gm || self) && !lastGm && (
        <Button variant="outline" size="sm" onClick={() => onChange(null)}>
          {self ? 'Leave' : 'Remove'}
        </Button>
      )}
    </li>
  );
}

function EnterGame({ game, characters, go }: Readonly<{ game: GameDetail; characters: Character[]; go: Go }>) {
  const [picked, setPicked] = useState('');
  const [error, setError] = useState<string>();
  const enter = async () => {
    try {
      await api.joinGame(game.id, picked || undefined);
      go({ name: 'play', game: game.id });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="auth frame lobby-form">
      <h2 className="lobby-heading">{game.you ? 'Take your seat' : 'Join this game'}</h2>
      <label className="auth-field">
        <span>Bring a character</span>
        <SelectField
          className="w-full"
          value={picked}
          onValueChange={setPicked}
          options={[
            { value: '', label: game.you === 'gm' ? 'None: run the game' : 'None for now' },
            ...characters.map((c) => ({ value: c.id, label: `${c.name}, ${characterSummary(c)}` })),
          ]}
        />
      </label>
      {error && <p className="menu-error">{error}</p>}
      <Button onClick={() => void enter()}>Enter the game</Button>
    </div>
  );
}

function InvitePanel({ game, onChanged }: Readonly<{ game: GameDetail; onChanged: () => void }>) {
  const [copied, setCopied] = useState(false);
  const link = game.invite && inviteLink(location.href, game.invite);
  const renew = async () => {
    await api.newInvite(game.id);
    setCopied(false);
    onChanged();
  };
  const copy = () => {
    if (!link) return;
    void navigator.clipboard.writeText(link);
    setCopied(true);
  };
  const toggleOpen = async (open: boolean) => {
    await api.setOpen(game.id, open);
    onChanged();
  };
  return (
    <div className="auth frame lobby-form">
      <h2 className="lobby-heading">Invite players</h2>
      {link ? (
        <Input className="lobby-link" readOnly value={link} onFocus={(e) => e.target.select()} />
      ) : (
        <p className="menu-note">No invite link yet.</p>
      )}
      <div className="auth-actions">
        <Button variant="outline" onClick={() => void renew()}>
          {link ? 'New link' : 'Make a link'}
        </Button>
        {link && (
          <Button variant="outline" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        )}
      </div>
      {link && <p className="menu-note">Anyone with the link joins as a player. A new link turns this one off.</p>}
      <label className="lobby-check">
        <Checkbox checked={game.open} onCheckedChange={(on) => void toggleOpen(on === true)} />
        Anyone on this server may join
      </label>
    </div>
  );
}

function DeleteGame({ game, onDeleted }: Readonly<{ game: GameDetail; onDeleted: () => void }>) {
  const [error, setError] = useState<string>();
  const remove = async () => {
    if (!confirm(`Delete "${game.name}" for good? Its scenes, actors and fog are gone with it.`)) return;
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
        Delete this game
      </Button>
      {error && <p className="menu-error">{error}</p>}
    </div>
  );
}
