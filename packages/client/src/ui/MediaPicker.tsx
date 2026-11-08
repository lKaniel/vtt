import { type MediaKind, searchMedia } from '@vtt/core';
import { BoxIcon, FolderOpenIcon, LoaderIcon, Music2Icon, UploadIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { assetUrl } from '../assets.ts';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { readBase64 } from './read-file.ts';

// A file of the game's or its packs' media, picked instead of typed: the
// tile's picture, a 3D model, a sound's file, a scene's thumbnail. The box
// still takes a typed path; the button beside it opens a searchable list.
// For a picture the GM can also upload a file from their computer, and a
// web address typed in is downloaded by the server into the game's uploads
// (other sites often won't hand their pictures to the map), so the box ends
// up holding the game's own copy.

/** Files shown at once in the list; typing narrows the rest. */
const SHOWN = 60;

interface MediaInputProps {
  session: Session;
  kind: MediaKind;
  value: string;
  onChange: (src: string) => void;
  placeholder?: string;
  /** What the box is for, for screen readers. */
  label: string;
}

const isWebAddress = (src: string) => /^https?:\/\//i.test(src);

/** A path box with a button that picks the file from the media list; for the GM's pictures, upload too. */
export function MediaInput({ session, kind, value, onChange, placeholder, label }: Readonly<MediaInputProps>) {
  // Callers key it by the value, so it starts over when the value changes.
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  const uploads = kind === 'image' && session.isGm();
  const save = (saving: Promise<string>) => {
    setBusy(true);
    saving.then(
      (src) => {
        setBusy(false);
        setText(src);
        onChange(src);
      },
      () => setBusy(false),
    );
  };
  const commit = (next: string) => {
    setText(next);
    if (next === value) return;
    if (uploads && isWebAddress(next)) save(session.packs.uploadUrl(next));
    else onChange(next);
  };
  return (
    <span className="flex min-w-0 items-center gap-1">
      <Input
        className="min-w-0 flex-1"
        value={text}
        aria-label={label}
        placeholder={placeholder}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(text.trim());
        }}
      />
      {session.isGm() && <MediaPicker session={session} kind={kind} label={label} onPick={commit} />}
      {uploads && <UploadPicture session={session} busy={busy} onFile={save} />}
    </span>
  );
}

/** The GM's button that uploads a picture from their computer into the game's assets. */
function UploadPicture({
  session,
  busy,
  onFile,
}: Readonly<{ session: Session; busy: boolean; onFile: (saving: Promise<string>) => void }>) {
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const saving = readBase64(file).then((data) => session.packs.upload(file.name, data));
    saving.catch(() => session.showError(t('media.unreadable', { name: file.name })));
    onFile(saving);
  };
  return (
    <Button
      asChild
      variant="outline"
      size="icon-sm"
      title={busy ? t('media.uploading') : t('media.uploadHint')}
      aria-disabled={busy}
    >
      <label>
        {busy ? <LoaderIcon className="animate-spin" /> : <UploadIcon />}
        <input type="file" accept="image/*" hidden disabled={busy} aria-label={t('media.upload')} onChange={onPick} />
      </label>
    </Button>
  );
}

/** The button and its list of the media of one kind; a click on one picks it. */
function MediaPicker({
  session,
  kind,
  label,
  onPick,
}: Readonly<{ session: Session; kind: MediaKind; label: string; onPick: (src: string) => void }>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) session.packs.requestMedia();
  }, [open, session]);
  const list = open ? searchMedia(session.packs.media, { query, kind }) : [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t('media.pick', { what: label })}
          title={t('media.pickHint')}
        >
          <FolderOpenIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end" aria-label={t('media.pick', { what: label })}>
        <Input
          autoFocus
          value={query}
          placeholder={t('media.search')}
          aria-label={t('media.search')}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="m-0 mt-2 grid max-h-72 list-none p-0 grid-cols-3 gap-1 overflow-y-auto">
          {list.slice(0, SHOWN).map((m) => (
            <li key={m.src}>
              <Button
                variant="ghost"
                className="flex h-auto w-full flex-col items-stretch gap-0.5 p-1"
                title={m.src}
                onClick={() => {
                  onPick(m.src);
                  setOpen(false);
                }}
              >
                <MediaLook src={m.kind === 'image' ? m.src : m.thumb} kind={m.kind} />
                <span className="truncate text-[10px]">{m.name}</span>
              </Button>
            </li>
          ))}
        </ul>
        <p className="muted mt-1 text-xs">
          {list.length > SHOWN ? t('media.more', { n: list.length - SHOWN }) : !list.length && t('media.none')}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function MediaLook({ src, kind }: Readonly<{ src?: string; kind: MediaKind }>) {
  if (src) return <img src={assetUrl(src)} alt="" loading="lazy" className="h-14 w-full object-contain" />;
  const Icon = kind === 'audio' ? Music2Icon : BoxIcon;
  return (
    <span className="flex h-14 items-center justify-center text-gold">
      <Icon className="size-6" />
    </span>
  );
}
