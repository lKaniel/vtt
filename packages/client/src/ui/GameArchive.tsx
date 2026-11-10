import type { BackupInfo, GameDetail } from '@vtt/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../server-api.ts';
import { Button } from './kit/button.tsx';
import { FileInput } from './kit/file-input.tsx';

// Keeping a game safe, in the lobby: the GM's backups (made when the game
// loads, every 15 minutes of play if it changed, and by hand) with restore,
// the game as a zip download, and anyone making a new game from such a zip.

const REASONS: Record<BackupInfo['reason'], string> = {
  load: 'when it loaded',
  timer: 'during play',
  manual: 'by hand',
  restore: 'before a restore',
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
    <div className="auth frame lobby-form" data-slot="backups">
      <h2 className="lobby-heading">Backups</h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void run(() => api.backUp(game.id), 'Backed up.')}>
          Back up now
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={api.exportUrl(game.id)} download={`${game.id}.zip`}>
            Download as zip
          </a>
        </Button>
      </div>
      <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
        {backups.map((b) => (
          <li key={b.id} className="flex items-center gap-2 text-sm">
            <span className="grow">
              {when(b.at)} <span className="menu-note">{REASONS[b.reason]}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              title="Puts the game back as it was then (the game as it is now is backed up first)"
              onClick={() =>
                void run(() => api.restoreBackup(game.id, b.id), `Restored the game to ${when(b.at)}.`, onRestored)
              }
            >
              Restore
            </Button>
          </li>
        ))}
      </ul>
      {!backups.length && <p className="menu-note">No backups yet: one is made when the game loads.</p>}
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
    <div className="auth frame lobby-form" data-slot="import-zip">
      <h2 className="lobby-heading">Import a game</h2>
      <p className="menu-note">A game downloaded as a zip from its page here becomes a new game, players and all.</p>
      <Button asChild variant="outline" disabled={busy}>
        <label>
          {busy ? 'Importing…' : 'Pick a zip'}
          <FileInput accept=".zip,application/zip" disabled={busy} onChange={(e) => void onPick(e)} />
        </label>
      </Button>
      {error && <p className="menu-error">{error}</p>}
    </div>
  );
}
