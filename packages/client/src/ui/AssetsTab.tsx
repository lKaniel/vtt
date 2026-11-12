import { type MediaEntry, type MediaKind, mediaEntry, type PackInfo, searchMedia } from '@vtt/core';
import { ChevronRightIcon, EyeIcon, FolderIcon, MapIcon } from 'lucide-react';
import { t } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import { assetUrl } from '../assets.ts';
import type { Session } from '../session/session.ts';
import { startDrag } from '../play/drops.ts';
import { BaileywikiView } from './BaileywikiView.tsx';
import { PluginsView } from './PluginsView.tsx';
import { readBase64 } from './read-file.ts';
import { AssetPicture } from './AssetPicture.tsx';
import { browse, type Folder, within } from './asset-folders.ts';
import type { StampAsset } from '../editor/stamp.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Toggle } from './kit/toggle.tsx';
import { SelectField } from './kit/select.tsx';
import { Checkbox } from './kit/checkbox.tsx';
import { Pressable } from './kit/pressable.tsx';
import { FileInput } from './kit/file-input.tsx';

// The GM's Assets tab: the pictures, sounds and videos of the game and the
// packs it uses (search, tags, upload; drag a picture onto the map to make
// it a tile), and the packs themselves: turn installed packs on for this
// game, and copy scenes and actors in from their compendia; and the plugins
// it loads (PluginsView.tsx); and Baileywiki's scenes (BaileywikiView.tsx).

type View = 'media' | 'packs' | 'plugins' | 'baileywiki';
/** Thumbnails shown at once; typing narrows the rest. */
const SHOWN = 150;
const KIND_LABEL: Record<MediaKind, string> = {
  image: 'Pictures',
  audio: 'Sounds',
  video: 'Videos',
  model: '3D models',
};

export function AssetsTab({ session }: Readonly<{ session: Session }>) {
  const [view, setView] = useState<View>('media');
  useEffect(() => {
    session.packs.request();
  }, [session]);
  return (
    <div className="lib assets">
      <nav className="lib-cats">
        <Toggle pressed={view === 'media'} onPressedChange={() => setView('media')}>
          Media
        </Toggle>
        <Toggle pressed={view === 'packs'} onPressedChange={() => setView('packs')}>
          Packs
        </Toggle>
        <Toggle pressed={view === 'plugins'} onPressedChange={() => setView('plugins')}>
          Plugins
        </Toggle>
        <Toggle pressed={view === 'baileywiki'} onPressedChange={() => setView('baileywiki')}>
          Baileywiki
        </Toggle>
      </nav>
      {view === 'media' && <MediaView session={session} />}
      {view === 'packs' && <PacksView session={session} />}
      {view === 'plugins' && <PluginsView session={session} />}
      {view === 'baileywiki' && <BaileywikiView session={session} />}
    </div>
  );
}

function UploadButton({ session }: Readonly<{ session: Session }>) {
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const file of e.target.files ?? []) {
      void readBase64(file).then(
        (data) => void session.packs.upload(file.name, data).catch(() => undefined),
        () => session.showError(`Could not read ${file.name}`),
      );
    }
    e.target.value = '';
  };
  return (
    <Button asChild variant="outline" size="sm" className="asset-upload">
      <label>
        Upload
        <FileInput accept="image/*,audio/*,video/*" multiple onChange={onPick} />
      </label>
    </Button>
  );
}

function MediaFilters({
  session,
  query,
  setQuery,
  kind,
  setKind,
}: Readonly<{
  session: Session;
  query: string;
  setQuery: (q: string) => void;
  kind: MediaKind | '';
  setKind: (k: MediaKind | '') => void;
}>) {
  return (
    <div className="lib-filter">
      <Input
        className="lib-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('assets.search')}
        aria-label={t('assets.search')}
      />
      <SelectField
        value={kind}
        onValueChange={(k) => setKind(k as MediaKind | '')}
        aria-label="Kind"
        options={[
          { value: '', label: 'All' },
          ...(Object.keys(KIND_LABEL) as MediaKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] })),
        ]}
      />
      <UploadButton session={session} />
    </div>
  );
}

/** A folder's name on screen: the game's own files, a pack by its name, or the folder's own name. */
function folderName(session: Session, path: readonly string[]): string {
  if (path.length > 1) return path.at(-1)!.replace(/[_-]+/g, ' ');
  if (path[0] === '') return t('assets.thisGame');
  return session.packs.list.find((p) => p.id === path[0])?.name ?? path[0]!;
}

/** Where you are: the top, then each folder down to this one, each a button back up. */
function Crumbs({ session, at, open }: Readonly<{ session: Session; at: string[]; open: (path: string[]) => void }>) {
  return (
    <nav className="flex flex-wrap items-center gap-0.5 pb-1 text-xs" aria-label={t('assets.where')}>
      <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => open([])}>
        {t('assets.top')}
      </Button>
      {at.map((_, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <ChevronRightIcon className="size-3 opacity-50" />
          <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => open(at.slice(0, i + 1))}>
            {folderName(session, at.slice(0, i + 1))}
          </Button>
        </span>
      ))}
    </nav>
  );
}

/** What was stamped lately: a click picks it up again. */
function Recent({ session }: Readonly<{ session: Session }>) {
  const recent = session.editor.stamp.recent;
  if (!recent.length) return null;
  return (
    <div className="flex gap-1 overflow-x-auto pb-1" role="list" aria-label={t('assets.recent')}>
      {recent.map((r) => {
        const media = mediaEntry(r.src, r.src.split('/').at(-1) ?? r.src);
        if (!media) return null;
        return (
          <Pressable
            key={r.src}
            role="listitem"
            className={`asset-thumb w-14 shrink-0 ${session.editor.stamp.asset?.src === r.src && session.editor.stamp.armed ? 'on' : ''}`}
            title={t('assets.pickUp', { name: media.name })}
            onClick={() => session.editor.stamp.arm(r)}
          >
            <AssetPicture media={media} className="h-10 w-full object-contain" />
          </Pressable>
        );
      })}
    </div>
  );
}

function FolderTile({ session, folder, open }: Readonly<{ session: Session; folder: Folder; open: () => void }>) {
  const name = folderName(session, folder.path);
  return (
    <li className="asset-thumb asset-folder" title={name}>
      <Pressable
        className="flex w-full flex-col items-center"
        onClick={open}
        aria-label={t('assets.openFolder', { name })}
      >
        <FolderIcon className="h-[60px] w-10 opacity-70" />
        <span className="asset-name">{name}</span>
        <span className="asset-name">{folder.count}</span>
      </Pressable>
    </li>
  );
}

function MediaView({ session }: Readonly<{ session: Session }>) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<MediaKind | ''>('');
  const [folder, setFolder] = useState<string[]>([]);
  // Fresh each time: packs may have been turned on, or files added, since.
  useEffect(() => {
    session.packs.requestMedia();
  }, [session]);
  const media = kind ? session.packs.media.filter((m) => m.kind === kind) : session.packs.media;
  const searching = query.trim() !== '';
  const here = browse(media, folder);
  const files = searching ? searchMedia(within(media, folder), { query }) : here.files;
  const folders = searching ? [] : here.folders;
  return (
    <>
      <MediaFilters {...{ session, query, setQuery, kind, setKind }} />
      <Recent session={session} />
      <Crumbs session={session} at={here.at} open={setFolder} />
      <ul className="asset-grid lib-scroll">
        {folders.map((f) => (
          <FolderTile key={f.path.join('/')} session={session} folder={f} open={() => setFolder(f.path)} />
        ))}
        {files.slice(0, SHOWN).map((m) => (
          <MediaTile key={m.src} session={session} media={m} />
        ))}
        {files.length > SHOWN && <li className="muted lib-hint">{t('assets.more', { n: files.length - SHOWN })}</li>}
        {files.length + folders.length === 0 && <li className="muted lib-hint">{t('assets.none')}</li>}
      </ul>
      <p className="muted lib-hint">{t('assets.hint')}</p>
    </>
  );
}

function MediaTile({ session, media }: Readonly<{ session: Session; media: MediaEntry }>) {
  const [size, setSize] = useState<{ w: number; h: number }>();
  const title = [media.name, ...media.tags].join(' · ');
  if (media.kind === 'audio') {
    return (
      <li className="asset-row" title={title}>
        <span className="lib-name">{media.name}</span>
        <audio src={assetUrl(media.src)} controls preload="none" />
      </li>
    );
  }
  const held = session.editor.stamp.armed && session.editor.stamp.asset?.src === media.src;
  return (
    <li
      className={`asset-thumb relative ${held ? 'on' : ''}`}
      title={`${title}\n${t('assets.pickUpHint')}`}
      aria-label={media.name}
      aria-pressed={held}
      draggable
      onDragStart={(e) => startDrag(e, { kind: 'media', src: media.src, ...size })}
      onClick={() =>
        session.editor.stamp.arm({
          src: media.src,
          kind: media.kind as StampAsset['kind'],
          ...(size && { size: [size.w, size.h] }),
        })
      }
    >
      <AssetPicture media={media} onSize={setSize} />
      <span className="asset-name">{media.name}</span>
      {media.kind === 'image' && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-1 right-1 bg-black/60"
          aria-label={`Show ${media.name} to players`}
          title="Show to players"
          onClick={(e) => {
            e.stopPropagation();
            session.journal.showImage(media.src, media.name);
          }}
        >
          <EyeIcon />
        </Button>
      )}
      {media.kind === 'image' && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-1 left-1 bg-black/60"
          aria-label={t('assets.useAsMap', { name: media.name })}
          title={t('assets.useAsMapHint')}
          onClick={(e) => {
            e.stopPropagation();
            session.tiles.setMap(media.src, size);
          }}
        >
          <MapIcon />
        </Button>
      )}
    </li>
  );
}

function PacksView({ session }: Readonly<{ session: Session }>) {
  return (
    <div className="lib-scroll">
      {session.packs.problems.length > 0 && (
        <ul className="asset-problems">
          {session.packs.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <ul className="lib-list">
        {session.packs.list.map((p) => (
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
        <Checkbox
          checked={pack.enabled}
          disabled={pack.builtin}
          onCheckedChange={(on) => session.packs.setPackEnabled(pack.id, on === true)}
          aria-label={`Use ${pack.name}`}
        />
        <Pressable className="lib-text" onClick={() => setOpen(!open)}>
          <span className="lib-name">{pack.name}</span>
          <span className="lib-sub">{sub}</span>
        </Pressable>
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
  const docs = session.packs.compendiumDocs(pack.id, compendium.id);
  const toggle = () => {
    if (!open) session.packs.openCompendium(pack.id, compendium.id);
    setOpen(!open);
  };
  const label = `${compendium.name ?? compendium.id} (${compendium.type})`;
  if (!IMPORTED.has(compendium.type)) {
    const where = pack.enabled ? 'In the Compendium tab.' : 'Turn the pack on to use it.';
    return <p className="lib-sub">{`${label}: ${where}`}</p>;
  }
  const add = (doc: unknown) =>
    void session.packs
      .wholeDoc(pack.id, compendium.id, doc)
      .then((whole) => importDoc(session, compendium.type, whole, pack.name));
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
            <Button variant="outline" size="sm" onClick={() => add(doc)}>
              {ADD_LABEL[compendium.type] ?? 'Add to Actors'}
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}

const ADD_LABEL: Record<string, string> = { scene: 'Import', prefab: 'Place' };

/** Copies one compendium document into the game, as its type goes in. */
function importDoc(session: Session, type: string, doc: unknown, folder: string): void {
  if (type === 'scene') session.packs.importScene(doc);
  else if (type === 'prefab') session.packs.importPrefab(doc);
  else if (type === 'journal' || type === 'rolltable' || type === 'playlist') session.packs.importEntry(type, doc);
  else session.packs.importActor(doc, session.folders.ensure('actors', folder));
}
