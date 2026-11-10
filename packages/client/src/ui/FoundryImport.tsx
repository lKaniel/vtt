import type { FoundryImportReport, GameSummary } from '@vtt/shared';
import { useState } from 'react';
import { api } from '../server-api.ts';
import { importSummary, keptSummary, leftOutDetail } from '../foundry-report.ts';
import { t, useLanguage } from '../i18n/index.ts';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { Card } from './kit/card.tsx';
import { Input } from './kit/input.tsx';
import { SelectField } from './kit/select.tsx';

// The admin's "Import a Foundry world" box in the lobby: a world folder on
// the server's disk becomes a new game (server/foundry-world.ts), or is
// imported again into a game it made, keeping what was made here since
// (server/foundry-reimport.ts). The box then says what came along, what
// was kept and what stayed behind.

function ImportDone({ report, onOpen }: Readonly<{ report: FoundryImportReport; onOpen: () => void }>) {
  useLanguage();
  return (
    <div className="flex flex-col gap-2" data-testid="foundry-report">
      <p className="text-sm">{t('foundry.ready', { name: report.name, summary: importSummary(report) })}</p>
      {report.kept && <p className="text-sm">{keptSummary(report.kept)}</p>}
      {report.left.length > 0 && (
        <Card className="max-h-64 overflow-y-auto p-2 text-xs">
          <p className="mb-1 font-semibold">{t('foundry.leftOut')}</p>
          <ul className="flex flex-col gap-1.5">
            {report.left.map((l) => (
              <li key={l.what}>
                <div className="flex items-start gap-2">
                  <Badge variant="muted">{l.count}</Badge>
                  <span>{l.what}</span>
                </div>
                {leftOutDetail(l) && <p className="pl-9 text-muted-foreground">{leftOutDetail(l)}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Button onClick={onOpen}>{t('foundry.open')}</Button>
    </div>
  );
}

interface Fields {
  folder: string;
  name: string;
  dataDir: string;
}

/** Sends the import: a new game, or again into `into`. */
async function send(into: string, f: Fields): Promise<{ id: string; report: FoundryImportReport }> {
  const folder = f.folder.trim();
  const dataDir = f.dataDir.trim() ? { dataDir: f.dataDir.trim() } : {};
  if (into) {
    const { report } = await api.reimportFoundry(into, { ...(folder && { folder }), ...dataDir });
    return { id: into, report };
  }
  const { game, report } = await api.importFoundry({ folder, ...(f.name.trim() ? { name: f.name } : {}), ...dataDir });
  return { id: game.id, report };
}

function ImportFields({
  again,
  fields,
  set,
}: Readonly<{ again: boolean; fields: Fields; set: (f: Partial<Fields>) => void }>) {
  return (
    <>
      <label className="auth-field">
        <span>{t(again ? 'foundry.folderAgain' : 'foundry.folder')}</span>
        <Input
          value={fields.folder}
          placeholder={again ? t('foundry.folderAgainHint') : '…/FoundryVTT/Data/worlds/my-world'}
          onChange={(e) => set({ folder: e.target.value })}
        />
      </label>
      {!again && (
        <label className="auth-field">
          <span>{t('foundry.name')}</span>
          <Input
            value={fields.name}
            placeholder={t('foundry.nameHint')}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
      )}
      <label className="auth-field">
        <span>{t('foundry.data')}</span>
        <Input
          value={fields.dataDir}
          placeholder={t('foundry.dataHint')}
          onChange={(e) => set({ dataDir: e.target.value })}
        />
      </label>
    </>
  );
}

interface EditorProps {
  games: readonly GameSummary[];
  busy: boolean;
  error?: string;
  into: string;
  setInto: (id: string) => void;
  fields: Fields;
  set: (f: Partial<Fields>) => void;
}

/** The box before importing: which game it goes into, the folders, the button. */
function ImportEditor({ games, busy, error, into, setInto, fields, set }: Readonly<EditorProps>) {
  const again = into !== '';
  const submitLabel = again ? 'foundry.importAgain' : 'foundry.import';
  return (
    <>
      <p className="menu-note">{t(again ? 'foundry.againNote' : 'foundry.intro')}</p>
      {games.length > 0 && (
        <label className="auth-field">
          <span>{t('foundry.into')}</span>
          <SelectField
            value={into}
            onValueChange={setInto}
            aria-label={t('foundry.into')}
            options={[
              { value: '', label: t('foundry.intoNew') },
              ...games.map((g) => ({ value: g.id, label: g.name })),
            ]}
          />
        </label>
      )}
      <ImportFields again={again} fields={fields} set={set} />
      {error && <p className="menu-error">{error}</p>}
      <Button type="submit" variant="outline" disabled={busy || (!again && !fields.folder.trim())}>
        {busy ? t('foundry.importing') : t(submitLabel)}
      </Button>
    </>
  );
}

export function FoundryImportForm({
  games = [],
  onMade,
}: Readonly<{ games?: readonly GameSummary[]; onMade: (id: string) => void }>) {
  useLanguage();
  const [into, setInto] = useState('');
  const [fields, setFields] = useState<Fields>({ folder: '', name: '', dataDir: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ id: string; report: FoundryImportReport }>();

  const start = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      setDone(await send(into, fields));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth frame lobby-form" onSubmit={(e) => void start(e)}>
      <h2 className="lobby-heading">{t('foundry.title')}</h2>
      {done ? (
        <ImportDone report={done.report} onOpen={() => onMade(done.id)} />
      ) : (
        <ImportEditor
          {...{ games, busy, error, into, setInto, fields }}
          set={(f) => setFields((old) => ({ ...old, ...f }))}
        />
      )}
    </form>
  );
}
