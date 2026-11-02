import type { FoundryImportReport } from '@vtt/shared';
import { useState } from 'react';
import { api } from '../account-api.ts';
import { importSummary } from '../foundry-report.ts';
import { Button } from './kit/button.tsx';
import { Card } from './kit/card.tsx';
import { Input } from './kit/input.tsx';

// The admin's "Import a Foundry world" box in the lobby: a world folder on
// the server's disk becomes a new game (server/foundry-world.ts), and the
// box then says what came along and what stayed behind.

function ImportDone({ report, onOpen }: Readonly<{ report: FoundryImportReport; onOpen: () => void }>) {
  return (
    <div className="flex flex-col gap-2" data-testid="foundry-report">
      <p className="text-sm">
        <strong>{report.name}</strong> is ready: {importSummary(report)}.
      </p>
      {report.skipped.length > 0 && (
        <Card className="max-h-48 overflow-y-auto p-2 text-xs">
          <p className="mb-1 font-semibold">Left out</p>
          <ul className="list-disc pl-4">
            {report.skipped.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </Card>
      )}
      <Button onClick={onOpen}>Open the game</Button>
    </div>
  );
}

export function FoundryImportForm({ onMade }: Readonly<{ onMade: (id: string) => void }>) {
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [dataDir, setDataDir] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ id: string; report: FoundryImportReport }>();

  const start = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const input = { folder: folder.trim(), ...(name.trim() ? { name } : {}), ...(dataDir.trim() ? { dataDir } : {}) };
      const { game, report } = await api.importFoundry(input);
      setDone({ id: game.id, report });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth frame lobby-form" onSubmit={(e) => void start(e)}>
      <h2 className="lobby-heading">Import a Foundry world</h2>
      {done ? (
        <ImportDone report={done.report} onOpen={() => onMade(done.id)} />
      ) : (
        <>
          <p className="menu-note">
            Scenes, tokens, actors, journals, tables, playlists and their pictures, read straight from the world&apos;s
            folder on this server (Foundry can stay open).
          </p>
          <label className="auth-field">
            <span>World folder</span>
            <Input
              value={folder}
              placeholder="…/FoundryVTT/Data/worlds/my-world"
              onChange={(e) => setFolder(e.target.value)}
            />
          </label>
          <label className="auth-field">
            <span>Game name (optional)</span>
            <Input value={name} placeholder="The world's title" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="auth-field">
            <span>Foundry Data folder (optional)</span>
            <Input
              value={dataDir}
              placeholder="Found from the world folder"
              onChange={(e) => setDataDir(e.target.value)}
            />
          </label>
          {error && <p className="menu-error">{error}</p>}
          <Button type="submit" variant="outline" disabled={busy || !folder.trim()}>
            {busy ? 'Importing…' : 'Import world'}
          </Button>
        </>
      )}
    </form>
  );
}
