import type { PackManifest } from '@vtt/core';
import { useState } from 'react';
import { packFolder, uploadPack } from '../content/pack-upload.ts';
import { t } from '../i18n/index.ts';
import { api } from '../server-api.ts';
import { Button } from './kit/button.tsx';
import { FileInput } from './kit/file-input.tsx';
import { useLoad } from './useLoad.ts';

// Setup: the asset packs on this server, uploading a pack's folder file by
// file (content/pack-upload.ts) and deleting one.

const mb = (bytes: number) => (bytes / 1024 ** 2).toFixed(1);

/** Admin: installed packs, unfinished uploads, and the folder upload. */
export function PacksPanel() {
  const { data, error, reload } = useLoad(api.packs);
  const [status, setStatus] = useState<string>();
  const [failed, setFailed] = useState<string>();
  const [busy, setBusy] = useState(false);
  const act = async (step: () => Promise<string>) => {
    setBusy(true);
    setFailed(undefined);
    try {
      setStatus(await step());
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setBusy(false);
      reload();
    }
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = [...(e.target.files ?? [])];
    e.target.value = '';
    if (picked.length) void act(() => upload(picked, setStatus));
  };
  return (
    <div className="auth frame lobby-form" data-slot="packs">
      <h2 className="lobby-heading">{t('packs.title')}</h2>
      <p className="menu-note">{t('packs.intro')}</p>
      {data && <PackList packs={data.packs} pending={data.pending} busy={busy} act={act} />}
      <Button asChild variant="outline" size="sm" disabled={busy}>
        <label>
          {t('packs.upload')}
          <FileInput disabled={busy} onChange={onPick} {...{ webkitdirectory: '', directory: '' }} />
        </label>
      </Button>
      {status && <p className="menu-note">{status}</p>}
      {(failed ?? error) && <p className="menu-error">{failed ?? error}</p>}
    </div>
  );
}

async function upload(picked: File[], say: (text: string) => void): Promise<string> {
  say(t('packs.reading'));
  const folder = await packFolder(picked);
  const name = (folder.manifest as { name?: string }).name ?? '';
  const pack = await uploadPack(api, folder, (done, total) =>
    say(t('packs.uploading', { name, done: mb(done), total: mb(total) })),
  );
  return t('packs.done', { name: pack.name });
}

function PackList({
  packs,
  pending,
  busy,
  act,
}: Readonly<{
  packs: readonly PackManifest[];
  pending: readonly string[];
  busy: boolean;
  act: (step: () => Promise<string>) => Promise<void>;
}>) {
  const [sure, setSure] = useState<string>();
  const remove = (p: PackManifest) =>
    act(async () => {
      setSure(undefined);
      await api.deletePack(p.id);
      return t('packs.deleted', { name: p.name });
    });
  const cancel = (id: string) =>
    act(async () => {
      await api.cancelPack(id);
      return '';
    });
  return (
    <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
      {!packs.length && <li className="menu-note">{t('packs.none')}</li>}
      {packs.map((p) => (
        <li key={p.id} className="flex items-center gap-2 text-sm">
          <span className="grow">{p.name}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            title={t('packs.deleteHint')}
            onClick={() => (sure === p.id ? void remove(p) : setSure(p.id))}
          >
            {sure === p.id ? t('packs.deleteSure') : t('packs.delete')}
          </Button>
        </li>
      ))}
      {pending.map((id) => (
        <li key={id} className="flex items-center gap-2 text-sm">
          <span className="menu-note grow">{t('packs.pending', { id })}</span>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void cancel(id)}>
            {t('packs.cancel')}
          </Button>
        </li>
      ))}
    </ul>
  );
}
