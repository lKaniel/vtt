import type { GameSummary, OffsiteNight, OffsiteStatus } from '@vtt/shared';
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import { api } from '../server-api.ts';
import { Button } from './kit/button.tsx';
import { SelectField } from './kit/select.tsx';
import { useLoad } from './useLoad.ts';

// Setup: the nightly copies of every game off the server (the server's
// offsite-backups.ts): where they go, when the last one was made, making
// one now, and putting a game back as it was on a night.

const when = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Runs one request at a time, keeping what it said or why it failed, then reloads. */
function useRun(reload: () => void) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [failed, setFailed] = useState<string>();
  const run = async (step: () => Promise<string>) => {
    setBusy(true);
    setFailed(undefined);
    try {
      setNote(await step());
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setBusy(false);
      reload();
    }
  };
  return { busy, note, failed, run };
}

/** Admin: the off-server backups; `games` names the games still on the server. */
export function OffsitePanel({ games }: Readonly<{ games: readonly GameSummary[] }>) {
  const { data, error, reload } = useLoad(api.offsite);
  const { busy, note, failed, run } = useRun(reload);
  const backUp = () => run(async () => t('offsite.done', { n: (await api.offsiteNow()).games.length }));
  const restore = (night: string, game: string) =>
    run(async () => {
      await api.offsiteRestore(night, game);
      return t('offsite.restored', { game: nameOf(games, game), night });
    });
  const working = busy || !!data?.status.running;
  return (
    <div className="auth frame lobby-form" data-slot="offsite-backups">
      <h2 className="lobby-heading">{t('offsite.title')}</h2>
      {data && <StatusLines status={data.status} />}
      {data?.status.target && (
        <>
          <Button variant="outline" size="sm" disabled={working} onClick={() => void backUp()}>
            {working ? t('offsite.running') : t('offsite.now')}
          </Button>
          <NightPicker nights={data.nights} games={games} busy={busy} onRestore={(n, g) => void restore(n, g)} />
        </>
      )}
      {note && <p className="menu-note">{note}</p>}
      {(failed ?? error) && <p className="menu-error">{failed ?? error}</p>}
    </div>
  );
}

function nameOf(games: readonly GameSummary[], id: string): string {
  return games.find((g) => g.id === id)?.name ?? id;
}

function StatusLines({ status }: Readonly<{ status: OffsiteStatus }>) {
  if (!status.target) return <p className="menu-note">{t('offsite.none')}</p>;
  const { lastRun, lastError } = status;
  return (
    <>
      <p className="menu-note">{t('offsite.target', { hour: status.hour, target: status.target })}</p>
      <p className="menu-note">
        {lastRun ? t('offsite.lastRun', { when: when(lastRun.at), n: lastRun.games }) : t('offsite.never')}
      </p>
      {lastError && (!lastRun || lastError.at > lastRun.at) && (
        <p className="menu-error">{t('offsite.failed', { when: when(lastError.at), message: lastError.message })}</p>
      )}
    </>
  );
}

function NightPicker({
  nights,
  games,
  busy,
  onRestore,
}: Readonly<{
  nights: readonly OffsiteNight[];
  games: readonly GameSummary[];
  busy: boolean;
  onRestore: (night: string, game: string) => void;
}>) {
  const [picked, setPicked] = useState<string>();
  if (!nights.length) return <p className="menu-note">{t('offsite.noNights')}</p>;
  const night = nights.find((n) => n.night === picked) ?? nights[0]!;
  return (
    <>
      <SelectField
        value={night.night}
        aria-label={t('offsite.night')}
        onValueChange={setPicked}
        options={nights.map((n) => ({ value: n.night, label: n.night }))}
      />
      <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
        {night.games.map((id) => (
          <li key={id} className="flex items-center gap-2 text-sm">
            <span className="grow">
              {nameOf(games, id)}
              {!games.some((g) => g.id === id) && <span className="menu-note"> {t('offsite.gone')}</span>}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              title={t('offsite.restoreHint')}
              onClick={() => onRestore(night.night, id)}
            >
              {t('offsite.restore')}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
