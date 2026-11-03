import { type GameSummary, newGameIssues } from '@vtt/shared';
import type { SystemInfo } from '@vtt/core';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { t } from '../i18n/index.ts';
import { lastPlayedText } from '../lobby.ts';
import type { Route } from '../route.ts';
import { api, type SessionInfo } from '../server-api.ts';
import { BaileywikiPanel } from './BaileywikiPanel.tsx';
import { FoundryImportForm } from './FoundryImport.tsx';
import { ImportZip } from './GameArchive.tsx';
import { AdminPasswordForm, AdminUnlock } from './GameAccess.tsx';
import { ROLE_NAMES } from './role-names.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { SelectField } from './kit/select.tsx';

// Setup, Foundry style: behind the server's admin password, the games on
// this server with making, importing and deleting them, and the admin
// password itself. Also the pieces the games screens share.

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

export const systemLine = (g: Pick<GameSummary, 'systemName' | 'rules'>) => `${g.systemName}, ${g.rules} rules`;

/** Setup: the admin password first, then the games and making new ones. */
export function SetupScreen({
  info,
  refresh,
  go,
}: Readonly<{ info?: SessionInfo; refresh: () => Promise<void>; go: Go }>) {
  if (!info) return null;
  if (!info.admin) {
    return (
      <div className="menu" data-slot="setup-locked">
        <h1 className="menu-title">{t('setup.title')}</h1>
        <div className="auth frame">
          <p className="menu-note">{t('setup.locked')}</p>
          <AdminUnlock onUnlocked={refresh} />
        </div>
        <Button variant="outline" className="menu-back" onClick={() => go({ name: 'menu' })}>
          {t('join.back')}
        </Button>
      </div>
    );
  }
  return <SetupBody info={info} refresh={refresh} go={go} />;
}

function SetupBody({ info, refresh, go }: Readonly<{ info: SessionInfo; refresh: () => Promise<void>; go: Go }>) {
  const { data, error } = useLoad(api.games);
  const [now] = useState(() => Date.now());
  const open = (id: string) => go({ name: 'game', game: id });
  const lock = async () => {
    await api.lockAdmin();
    await refresh();
    go({ name: 'menu' });
  };
  return (
    <div className="account lobby" data-slot="setup">
      <LobbyHead kicker={t('setup.kicker')} title={t('setup.title')}>
        <Button variant="outline" onClick={() => go({ name: 'menu' })}>
          {t('setup.games')}
        </Button>
        {info.adminPassword && (
          <Button variant="outline" onClick={() => void lock()}>
            {t('setup.lock')}
          </Button>
        )}
      </LobbyHead>
      {!info.adminPassword && <p className="menu-error">{t('setup.noPassword')}</p>}
      {error && <p className="menu-error">{error}</p>}
      <div className="lobby-body">
        <div className="roster lobby-games">
          {data?.games.map((g) => (
            <GameCard key={g.id} g={g} now={now} onOpen={() => open(g.id)} />
          ))}
          {data && !data.games.length && <p className="account-empty">{t('setup.noGames')}</p>}
        </div>
        <aside className="lobby-side">
          {data && <NewGameForm systems={data.systems} onMade={open} />}
          <ImportZip onMade={open} />
          <FoundryImportForm onMade={open} />
          <BaileywikiPanel />
          {!info.adminFixed && <AdminPasswordForm has={info.adminPassword} onSaved={refresh} />}
        </aside>
      </div>
    </div>
  );
}

/** Your place in a game, for its card. */
function standing(g: GameSummary): string {
  return g.you ? ROLE_NAMES[g.you].name : t('lobby.notJoined');
}

export function GameCard({ g, now, onOpen }: Readonly<{ g: GameSummary; now: number; onOpen: () => void }>) {
  return (
    <button className="roster-card lobby-card" onClick={onOpen}>
      <span className="roster-name">{g.name}</span>
      <span className="roster-line">{systemLine(g)}</span>
      <span className="roster-stats">
        <span>{standing(g)}</span>
        <span>{t(g.members === 1 ? 'lobby.player' : 'lobby.players', { n: g.members })}</span>
        {g.online > 0 && <span className="lobby-online">{t('lobby.online', { n: g.online })}</span>}
      </span>
      <span className="menu-note">{lastPlayedText(g.lastPlayed, now)}</span>
      {g.home && <span className="roster-rules">{t('lobby.home')}</span>}
    </button>
  );
}

function NewGameForm({ systems, onMade }: Readonly<{ systems: SystemInfo[]; onMade: (id: string) => void }>) {
  const [name, setName] = useState('');
  const [system, setSystem] = useState(systems[0]?.id ?? '');
  const editions = systems.find((s) => s.id === system)?.editions ?? [];
  const [rules, setRules] = useState(editions[0]?.id ?? '');
  const [error, setError] = useState<string>();
  const issues = newGameIssues({ name, system, rules }, systems);

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
      <h2 className="lobby-heading">{t('setup.newGame')}</h2>
      <label className="auth-field">
        <span>Name</span>
        <Input value={name} placeholder="The Lost Mine" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="auth-field">
        <span>System</span>
        <SelectField
          className="w-full"
          value={system}
          onValueChange={setSystem}
          options={systems.map((s) => ({ value: s.id, label: s.name }))}
        />
      </label>
      <label className="auth-field">
        <span>Rules</span>
        <SelectField
          className="w-full"
          value={rules}
          onValueChange={setRules}
          options={editions.map((ed) => ({ value: ed.id, label: ed.name }))}
        />
      </label>
      <p className="menu-note">{t('setup.newGameHint')}</p>
      {error && <p className="menu-error">{error}</p>}
      <Button type="submit" disabled={issues.length > 0}>
        {t('setup.create')}
      </Button>
    </form>
  );
}
