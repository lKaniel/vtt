import type { BackupInfo, GameDetail } from '@vtt/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../server-api.ts';
import { Button } from './kit/button.tsx';
import { CardTitle } from './kit/card.tsx';
import { FileInput } from './kit/file-input.tsx';
import { type MessageKey, t } from '../i18n/index.ts';

// Keeping a game safe, in the lobby: the GM's backups (made when the game
// loads, every 15 minutes of play if it changed, and by hand) with restore,
// the game as a zip download, and anyone making a new game from such a zip.

const REASONS: Record<BackupInfo['reason'], MessageKey> = {
  load: 'backups.load',
  timer: 'backups.timer',
  manual: 'backups.manual',
  restore: 'backups.restore',
  reimport: 'backups.reimport',
};

const when = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** GM: the game's backups, newest first, each one restorable; and the zip download. `onRestored` reloads the page around it. */
export function BackupsPanel({ game, onRestored }: Readonly<{ game: GameDetail; onRestored: () => void }>) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const reload = useCallback(() => {
    api.backups(game.id).then(setBackups, (e: unknown) => {
      setError((e as Error).message);
    });
  }, [game.id]);
  useEffect(reload, [reload]);
  const run = async (step: () => Promise<unknown>, done: string, after?: () => void) => {
    setError(undefined);
    try {
      await step();
      setNote(done);
      reload();
      after?.();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="auth frame px-[22px] py-5" data-slot="backups">
      <CardTitle>{t('backups.title')}</CardTitle>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void run(() => api.backUp(game.id), t('backups.done'))}>
          {t('backups.now')}
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={api.exportUrl(game.id)} download={`${game.id}.zip`}>
            {t('backups.zip')}
          </a>
        </Button>
      </div>
      <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
        {backups.map((b) => (
          <li key={b.id} className="flex items-center gap-2 text-sm">
            <span className="grow">
              {when(b.at)} <span className="menu-note">{t(REASONS[b.reason])}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              title={t('backups.restoreTitle')}
              onClick={() =>
                void run(
                  () => api.restoreBackup(game.id, b.id),
                  t('backups.restored', { when: when(b.at) }),
                  onRestored,
                )
              }
            >
              {t('backups.restoreButton')}
            </Button>
          </li>
        ))}
      </ul>
      {!backups.length && <p className="menu-note">{t('backups.none')}</p>}
      {note && <p className="menu-note">{note}</p>}
      {error && <p className="menu-error">{error}</p>}
    </div>
  );
}

/** Anyone: a new game from a zip a GM downloaded, with you as its GM. */
export function ImportZip({ onMade }: Readonly<{ onMade: (id: string) => void }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      onMade((await api.importZip(file)).id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth frame px-[22px] py-5" data-slot="import-zip">
      <CardTitle>{t('importZip.title')}</CardTitle>
      <p className="menu-note">{t('importZip.hint')}</p>
      <Button asChild variant="outline" disabled={busy}>
        <label>
          {busy ? t('importZip.busy') : t('importZip.pick')}
          <FileInput accept=".zip,application/zip" disabled={busy} onChange={(e) => void onPick(e)} />
        </label>
      </Button>
      {error && <p className="menu-error">{error}</p>}
    </div>
  );
}
