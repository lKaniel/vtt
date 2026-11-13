import type { Doc } from '@vtt/core';
import { LoaderIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { FileInput } from './kit/file-input.tsx';
import { Input } from './kit/input.tsx';
import { readBase64 } from './read-file.ts';

// Adds tracks to a playlist or sounds to a soundboard: by a typed path (an
// asset or pack:// file) or uploaded from the GM's computer into the game's
// assets/uploads/, one file after another, each named after its file.

/** "Dragon roar.mp3" is "Dragon roar". */
const bareName = (file: string) => file.replace(/\.[^.]*$/, '').trim() || file;

/** Uploads the files one at a time and adds each as a track. */
async function uploadAll(session: Session, playlist: string, files: readonly File[]): Promise<void> {
  for (const file of files) {
    try {
      const src = await session.packs.upload(file.name, await readBase64(file));
      session.journal.addTrack(playlist, src, bareName(file.name));
    } catch {
      session.showError(t('media.unreadable', { name: file.name }));
    }
  }
}

export function AddTrack({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const [src, setSrc] = useState('');
  const [busy, setBusy] = useState(false);
  const add = (e: React.SubmitEvent) => {
    e.preventDefault();
    const file = src.trim();
    if (!file) return;
    session.journal.addTrack(doc.id, file);
    setSrc('');
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    void uploadAll(session, doc.id, files).finally(() => setBusy(false));
  };
  return (
    <form className="flex items-center gap-1" onSubmit={add}>
      <Input
        className="min-w-0 flex-1"
        value={src}
        aria-label={t('music.trackFile')}
        onChange={(e) => setSrc(e.target.value)}
        placeholder="/assets/music/inn.ogg or pack://…"
      />
      <Button variant="outline" size="sm" disabled={!src.trim()}>
        {t('music.add')}
      </Button>
      <Button asChild variant="outline" size="sm" title={t('music.uploadHint')} aria-disabled={busy}>
        <label>
          {busy ? <LoaderIcon className="animate-spin" /> : <UploadIcon />}
          {t(busy ? 'music.uploading' : 'music.upload')}
          <FileInput accept="audio/*" multiple disabled={busy} aria-label={t('music.upload')} onChange={onPick} />
        </label>
      </Button>
    </form>
  );
}
