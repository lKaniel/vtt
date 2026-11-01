import { type MediaEntry, type MediaKind, type PackInfo, searchMedia, topTags } from '@vtt/core';
import { useEffect, useState } from 'react';
import { assetUrl } from '../assets.ts';
import type { Session } from '../session.ts';
import { startDrag } from './ActorsTab.tsx';

// The GM's Assets tab: the pictures, sounds and videos of the game and the
// packs it uses (search, tags, upload; drag a picture onto the map to make
// it a tile), and the packs themselves: turn installed packs on for this
// game, and copy scenes and actors in from their compendia.

type View = 'media' | 'packs';
/** Thumbnails shown at once; typing narrows the rest. */
const SHOWN = 150;
const TAGS = 14;
const KIND_LABEL: Record<MediaKind, string> = { image: 'Pictures', audio: 'Sounds', video: 'Videos' };

export function AssetsTab({ session }: Readonly<{ session: Session }>) {
  const [view, setView] = useState<View>('media');
  useEffect(() => {
    session.requestPacks();
  }, [session]);
  return (
    <div className="lib assets">
      <nav className="lib-cats">
        <button className={view === 'media' ? 'on' : ''} onClick={() => setView('media')}>
          Media
        </button>
        <button className={view === 'packs' ? 'on' : ''} onClick={() => setView('packs')}>
          Packs
        </button>
      </nav>
      {view === 'media' ? <MediaView session={session} /> : <PacksView session={session} />}
    </div>
  );
}

/** Reads a file the GM picked as base64 for the upload message. */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
    reader.readAsDataURL(file);
  });
}

function UploadButton({ session }: Readonly<{ session: Session }>) {
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const file of e.target.files ?? []) {
      void readBase64(file).then(
        (data) => session.upload(file.name, data),
        () => session.showError(`Could not read ${file.name}`),
      );
    }
    e.target.value = '';
  };
  return (
    <label className="btn small asset-upload">
      Upload
      <input type="file" accept="image/*,audio/*,video/*" multiple hidden onChange={onPick} />
    </label>
  );
}

function MediaFilters({
  session,
  query,
  setQuery,
  kind,
  setKind,
  source,
  setSource,
}: Readonly<{
  session: Session;
  query: string;
  setQuery: (q: string) => void;
  kind: MediaKind | '';
  setKind: (k: MediaKind | '') => void;
  source: string | undefined;
  setSource: (s: string | undefined) => void;
}>) {
  const packs = session.packs.filter((p) => p.enabled && !p.builtin);
  return (
    <div className="lib-filter">
      <input
        className="lib-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search media…"
      />
      <select value={kind} onChange={(e) => setKind(e.target.value as MediaKind | '')} aria-label="Kind">
        <option value="">All</option>
        {(Object.keys(KIND_LABEL) as MediaKind[]).map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <select
        value={source ?? '*'}
        onChange={(e) => setSource(e.target.value === '*' ? undefined : e.target.value)}
        aria-label="From"
      >
        <option value="*">Everywhere</option>
        <option value="">This game</option>
        {packs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <UploadButton session={session} />
    </div>
  );
}

function MediaView({ session }: Readonly<{ session: Session }>) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<MediaKind | ''>('');
  const [source, setSource] = useState<string>();
  const [tag, setTag] = useState<string>();
  // Fresh each time: packs may have been turned on, or files added, since.
  useEffect(() => {
    session.requestMedia();
  }, [session]);
  const base = searchMedia(session.media, {
    query,
    ...(kind ? { kind } : {}),
    ...(source === undefined ? {} : { pack: source }),
  });
  const list = tag ? base.filter((m) => m.tags.includes(tag)) : base;
  return (
    <>
      <MediaFilters {...{ session, query, setQuery, kind, setKind, source, setSource }} />
      <div className="asset-tags">
        {topTags(base, TAGS).map((t) => (
          <button
            key={t}
            className={`lib-tag${t === tag ? ' on' : ''}`}
            onClick={() => setTag(t === tag ? undefined : t)}
          >
            {t}
          </button>
        ))}
      </div>
      <ul className="asset-grid lib-scroll">
        {list.slice(0, SHOWN).map((m) => (
          <MediaTile key={m.src} session={session} media={m} />
        ))}
        {list.length > SHOWN && (
          <li className="muted lib-hint">{list.length - SHOWN} more: type to narrow the list.</li>
        )}
        {list.length === 0 && <li className="muted lib-hint">Nothing here. Upload files, or turn packs on.</li>}
      </ul>
      <p className="muted lib-hint">
        Drag a picture onto the map to place it as a tile, or click it to place it in view.
      </p>
    </>
  );
}

function MediaTile({ session, media }: Readonly<{ session: Session; media: MediaEntry }>) {
  const [size, setSize] = useState<{ w: number; h: number }>();
  const title = [media.name, ...media.tags].join(' · ');
  if (media.kind !== 'image') {
    return (
      <li className="asset-row" title={title}>
        <span className="lib-name">{media.name}</span>
        {media.kind === 'audio' ? (
          <audio src={assetUrl(media.src)} controls preload="none" />
        ) : (
          <span className="lib-sub">video</span>
        )}
      </li>
    );
  }
  return (
    <li
      className="asset-thumb"
      title={title}
      draggable
      onDragStart={(e) => startDrag(e, { kind: 'media', src: media.src, ...size })}
      onClick={() => session.placeMedia(media.src, session.viewCentre(), size)}
    >
      <img
        src={assetUrl(media.src)}
        alt={media.name}
        loading="lazy"
        onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      />
      <span className="asset-name">{media.name}</span>
    </li>
  );
}

function PacksView({ session }: Readonly<{ session: Session }>) {
  return (
    <div className="lib-scroll">
      {session.packProblems.length > 0 && (
        <ul className="asset-problems">
          {session.packProblems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <ul className="lib-list">
        {session.packs.map((p) => (
          <PackRow key={p.id} session={session} pack={p} />
        ))}
      </ul>
      <p className="muted lib-hint">
        Install packs in the server&apos;s data/packs/ folder, or import a Foundry module with pnpm import-foundry.
      </p>
    </div>
  );
}

function PackRow({ session, pack }: Readonly<{ session: Session; pack: PackInfo }>) {
  const [open, setOpen] = useState(false);
  const sub = [pack.version && `v${pack.version}`, pack.author, pack.license, pack.builtin && 'always on']
    .filter(Boolean)
    .join(' · ');
  return (
    <li className={open ? 'lib-row lib-entry on' : 'lib-row lib-entry'}>
      <div className="lib-main pack-head">
        <input
          type="checkbox"
          checked={pack.enabled}
          disabled={pack.builtin}
          onChange={(e) => session.setPackEnabled(pack.id, e.target.checked)}
          aria-label={`Use ${pack.name}`}
        />
        <button className="lib-text" onClick={() => setOpen(!open)}>
          <span className="lib-name">{pack.name}</span>
          <span className="lib-sub">{sub}</span>
        </button>
      </div>
      {open && <PackDetail session={session} pack={pack} />}
    </li>
  );
}

function PackDetail({ session, pack }: Readonly<{ session: Session; pack: PackInfo }>) {
  return (
    <div className="lib-detail">
      {pack.description && <p className="lib-body">{pack.description}</p>}
      {pack.compendia.length === 0 && <p className="muted">Media only.</p>}
      {pack.compendia.map((c) => (
        <CompendiumView key={c.id} session={session} pack={pack} compendium={c} />
      ))}
    </div>
  );
}

/** Document types the GM copies into the game; the rest is rules content the Compendium tab shows. */
const IMPORTED = new Set(['scene', 'actor', 'journal', 'rolltable', 'playlist', 'prefab']);

const nameOf = (doc: unknown) => {
  const d = doc as { name?: unknown; id?: unknown };
  return typeof d.name === 'string' ? d.name : String(d.id);
};

function CompendiumView({
  session,
  pack,
  compendium,
}: Readonly<{ session: Session; pack: PackInfo; compendium: PackInfo['compendia'][number] }>) {
  const [open, setOpen] = useState(false);
  const docs = session.compendiumDocs(pack.id, compendium.id);
  const toggle = () => {
    if (!open) session.openCompendium(pack.id, compendium.id);
    setOpen(!open);
  };
  const label = `${compendium.name ?? compendium.id} (${compendium.type})`;
  if (!IMPORTED.has(compendium.type)) {
    const where = pack.enabled ? 'In the Compendium tab.' : 'Turn the pack on to use it.';
    return <p className="lib-sub">{`${label}: ${where}`}</p>;
  }
  const add = (doc: unknown) => importDoc(session, compendium.type, doc, pack.name);
  return (
    <details className="lib-folder" open={open}>
      <summary
        onClick={(e) => {
          e.preventDefault();
          toggle();
        }}
      >
        {label}
      </summary>
      {open && !docs && <p className="muted">Loading…</p>}
      <ul className="lib-list">
        {(docs ?? []).map((doc, i) => (
          <li key={i} className="lib-row">
            <span className="lib-name">{nameOf(doc)}</span>
            <button className="btn small" onClick={() => add(doc)}>
              {compendium.type === 'scene' ? 'Import' : 'Add to Actors'}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Copies one compendium document into the game, as its type goes in. */
function importDoc(session: Session, type: string, doc: unknown, folder: string): void {
  if (type === 'scene') session.importScene(doc);
  else if (type === 'prefab') session.importPrefab(doc);
  else if (type === 'journal' || type === 'rolltable' || type === 'playlist') session.importEntry(type, doc);
  else session.importActor(doc, folder);
}
