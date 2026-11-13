import type { Doc } from '@vtt/core';
import { useState } from 'react';
import type { Session } from '../session/session.ts';
import {
  AudioLinesIcon,
  ListOrderedIcon,
  MusicIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
  Volume2Icon,
  XIcon,
} from 'lucide-react';
import { t } from '../i18n/index.ts';
import { startDrag } from '../play/drops.ts';
import { AddTrack } from './AddTrack.tsx';
import { Directory, type DirItem } from './directory/Directory.tsx';
import { Button } from './kit/button.tsx';
import { Dialog, DialogContent, DialogTitle } from './kit/dialog.tsx';
import { SelectField } from './kit/select.tsx';
import { SoundboardEditor } from './SoundboardEditor.tsx';

interface Track {
  id: string;
  name: string;
  src: string;
  playing?: boolean;
  volume?: number;
  repeat?: boolean;
}

const nameOf = (doc: Doc) => (typeof doc.name === 'string' ? doc.name : doc.id);
const tracksOf = (doc: Doc) => (doc.tracks as Track[] | undefined) ?? [];

const MODES = ['sequence', 'shuffle', 'together'] as const;
const isBoard = (doc: Doc) => doc.mode === 'board';

/** A soundboard in the list: a click opens its buttons. */
function boardItem(session: Session, doc: Doc, edit: (id: string) => void): DirItem {
  return {
    key: doc.id,
    ref: { coll: 'playlists', id: doc.id },
    name: nameOf(doc),
    folder: typeof doc.folder === 'string' ? doc.folder : undefined,
    tags: { playing: 'no' },
    search: tracksOf(doc)
      .map((tr) => tr.name)
      .join(' '),
    look: {
      picture: (
        <span className="flex items-center justify-center text-gold">
          <AudioLinesIcon className="size-4" />
        </span>
      ),
      sub: t(tracksOf(doc).length === 1 ? 'board.sound' : 'board.sounds', { n: tracksOf(doc).length }),
    },
    open: () => edit(doc.id),
    openTwice: () => edit(doc.id),
    title: t('board.clickHint'),
    menu: [
      { label: t('board.open'), icon: AudioLinesIcon, run: () => edit(doc.id) },
      'separator',
      {
        label: t('list.delete'),
        icon: Trash2Icon,
        danger: true,
        run: () => session.journal.deleteEntry('playlists', doc.id),
      },
    ],
  };
}

function playlistItem(session: Session, doc: Doc, edit: (id: string) => void): DirItem {
  if (isBoard(doc)) return boardItem(session, doc, edit);
  const tracks = tracksOf(doc);
  const playing = tracks.some((tr) => tr.playing);
  const mode = typeof doc.mode === 'string' ? doc.mode : 'sequence';
  const toggle = () => (playing ? session.journal.stopPlaylist(doc.id) : session.journal.playPlaylist(doc.id));
  return {
    key: doc.id,
    ref: { coll: 'playlists', id: doc.id },
    name: nameOf(doc),
    folder: typeof doc.folder === 'string' ? doc.folder : undefined,
    tags: { playing: playing ? 'yes' : 'no' },
    search: tracks.map((tr) => tr.name).join(' '),
    look: {
      picture: (
        <span className={`flex items-center justify-center ${playing ? 'text-gold-bright' : 'text-gold'}`}>
          {playing ? <Volume2Icon className="size-4" /> : <MusicIcon className="size-4" />}
        </span>
      ),
      sub: playing
        ? t('music.playing', {
            track: tracks
              .filter((tr) => tr.playing)
              .map((tr) => tr.name)
              .join(', '),
          })
        : t('music.tracks', { n: tracks.length }),
      on: playing,
    },
    open: () => edit(doc.id),
    openTwice: toggle,
    drag: (e: React.DragEvent) => startDrag(e, { kind: 'playlist', id: doc.id }),
    title: t('music.clickHint'),
    menu: [
      {
        label: t(playing ? 'music.stop' : 'music.play'),
        icon: playing ? SquareIcon : PlayIcon,
        run: toggle,
        disabled: !tracks.length,
      },
      {
        label: t('music.order'),
        icon: ListOrderedIcon,
        items: MODES.map((m) => ({
          label: t(`music.mode.${m}`),
          checked: mode === m,
          run: () => session.journal.patchEntry('playlists', doc.id, { mode: m }),
        })),
      },
      { label: t('music.editTracks'), icon: PencilIcon, run: () => edit(doc.id) },
      'separator',
      {
        label: t('list.delete'),
        icon: Trash2Icon,
        danger: true,
        run: () => session.journal.deleteEntry('playlists', doc.id),
      },
    ],
  };
}

/**
 * GM: playlists and soundboards, in folders. Play a playlist (every player hears it), pick a track, stop;
 * press a soundboard's button to play its sound once. Tracks and sounds are added by their file or uploaded.
 */
export function PlaylistsTab({ session }: Readonly<{ session: Session }>) {
  const [editing, setEditing] = useState<string>();
  const items = session.docs.all('playlists').map((doc) => playlistItem(session, doc, setEditing));
  const open = editing ? session.docs.get('playlists', editing) : undefined;
  return (
    <>
      <Directory
        session={session}
        id="playlists"
        items={items}
        folders={{ kind: 'playlists', editable: true }}
        what={t('music.what')}
        filters={[
          {
            key: 'playing',
            label: t('music.now'),
            options: [
              { value: 'yes', label: t('music.now.yes') },
              { value: 'no', label: t('music.now.no') },
            ],
          },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => session.journal.createEntry('playlist')}>
              <PlusIcon />
              {t('music.new')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => session.journal.createEntry('playlist', { name: t('board.newName'), mode: 'board' })}
            >
              <AudioLinesIcon />
              {t('board.new')}
            </Button>
          </>
        }
        empty={t('music.none')}
        hint={t('music.hint')}
      />
      <Dialog open={!!open} onOpenChange={(on) => !on && setEditing(undefined)}>
        {open && (
          <DialogContent>
            <DialogTitle>{nameOf(open)}</DialogTitle>
            {isBoard(open) ? (
              <SoundboardEditor session={session} doc={open} />
            ) : (
              <PlaylistEditor session={session} doc={open} />
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function PlaylistEditor({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const tracks = tracksOf(doc);
  const playing = tracks.some((tr) => tr.playing);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SelectField
          value={typeof doc.mode === 'string' ? doc.mode : 'sequence'}
          aria-label={t('music.order')}
          onValueChange={(mode) => session.journal.patchEntry('playlists', doc.id, { mode })}
          options={MODES.map((m) => ({ value: m, label: t(`music.mode.${m}`) }))}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!tracks.length}
          onClick={() => (playing ? session.journal.stopPlaylist(doc.id) : session.journal.playPlaylist(doc.id))}
        >
          {t(playing ? 'music.stop' : 'music.play')}
        </Button>
      </div>
      <ul className="lib-list">
        {tracks.map((tr) => (
          <li key={tr.id} className={`lib-row${tr.playing ? ' on' : ''}`}>
            <span className="lib-name flex-1 px-1.5">{tr.name}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('music.playTrack', { track: tr.name })}
              title={t('music.playTrack', { track: tr.name })}
              onClick={() => session.journal.playPlaylist(doc.id, tr.id)}
            >
              <PlayIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('music.removeTrack', { track: tr.name })}
              title={t('music.removeTrack', { track: tr.name })}
              onClick={() => session.journal.removeTrack(doc.id, tr.id)}
            >
              <XIcon />
            </Button>
          </li>
        ))}
      </ul>
      <AddTrack session={session} doc={doc} />
    </div>
  );
}
