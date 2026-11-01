import type { Doc } from '@vtt/core';
import { useState } from 'react';
import type { Session } from '../session.ts';

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

/** GM: playlists. Play one (every player hears it), pick a track, stop; add tracks by their file. */
export function PlaylistsTab({ session }: Readonly<{ session: Session }>) {
  const lists = session.docs.all('playlists').sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  return (
    <div className="scenes-tab">
      <button className="btn small" onClick={() => session.createEntry('playlist')}>
        New playlist
      </button>
      <ul className="rows">
        {lists.map((doc) => (
          <PlaylistRow key={doc.id} session={session} doc={doc} />
        ))}
      </ul>
      <p className="muted">Every player hears what plays. Ambient sounds on the map are placed in the Sounds mode.</p>
    </div>
  );
}

function PlaylistRow({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const tracks = tracksOf(doc);
  const playing = tracks.some((t) => t.playing);
  return (
    <li className="scene-row">
      <span className="lib-name">{nameOf(doc)}</span>
      <span className="row-actions">
        <select
          value={typeof doc.mode === 'string' ? doc.mode : 'sequence'}
          aria-label="Order"
          onChange={(e) => session.patchEntry('playlists', doc.id, { mode: e.target.value })}
        >
          <option value="sequence">In order</option>
          <option value="shuffle">Shuffle</option>
          <option value="together">All at once</option>
        </select>
        <button
          className="btn small"
          onClick={() => (playing ? session.stopPlaylist(doc.id) : session.playPlaylist(doc.id))}
        >
          {playing ? 'Stop' : 'Play'}
        </button>
      </span>
      <ul className="lib-list">
        {tracks.map((t) => (
          <li key={t.id} className={`lib-row${t.playing ? ' here' : ''}`}>
            <span className="lib-name">{t.name}</span>
            <button className="btn small" onClick={() => session.playPlaylist(doc.id, t.id)}>
              ▶
            </button>
          </li>
        ))}
      </ul>
      <AddTrack session={session} doc={doc} />
    </li>
  );
}

function AddTrack({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const [src, setSrc] = useState('');
  const add = (e: React.SubmitEvent) => {
    e.preventDefault();
    const file = src.trim();
    if (!file) return;
    const tracks = tracksOf(doc);
    const name =
      file
        .split('/')
        .at(-1)
        ?.replace(/\.[^.]*$/, '') ?? 'Track';
    const id = `track-${tracks.length + 1}`;
    session.patchEntry('playlists', doc.id, { tracks: [...tracks, { id, name, src: file }] });
    setSrc('');
  };
  return (
    <form className="scene-new" onSubmit={add}>
      <input value={src} onChange={(e) => setSrc(e.target.value)} placeholder="/assets/music/inn.ogg or pack://…" />
      <button className="btn small" disabled={!src.trim()}>
        Add
      </button>
    </form>
  );
}
