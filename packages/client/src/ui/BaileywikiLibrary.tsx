import type { PackInfo } from '@vtt/core';
import { useEffect, useState } from 'react';
import { assetUrl } from '../assets.ts';
import { type LibraryEntry, libraryTags, searchLibrary } from '../content/library-search.ts';
import { t } from '../i18n/index.ts';
import { startDrag } from '../play/drops.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Pressable } from './kit/pressable.tsx';
import { Toggle } from './kit/toggle.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

// The Baileywiki library, as Baileywiki's own browsers in Foundry: the
// prefabs and scenes of the `baileywiki` pack (built by `pnpm
// import-baileywiki` from the modules installed in Foundry) as thumbnails,
// found by words and tags. Click a prefab to place it in view, or drag it
// onto the map; click a scene to import it into the game.

const PACK = 'baileywiki';
/** Thumbnails shown at once; typing narrows the rest. */
const SHOWN = 120;
const TAGS = 18;

type Compendium = PackInfo['compendia'][number];

const browsable = (c: Compendium) => c.type === 'prefab' || c.type === 'scene';

const entriesOf = (docs: unknown[] | undefined): LibraryEntry[] =>
  (docs ?? []).flatMap((d) => {
    const e = d as Partial<LibraryEntry>;
    return typeof e.id === 'string' && typeof e.name === 'string' ? [e as LibraryEntry] : [];
  });

export function BaileywikiLibrary({ session }: Readonly<{ session: Session }>) {
  const pack = session.packs.list.find((p) => p.id === PACK);
  if (!pack) return <p className="muted text-sm">{t('bwLibrary.noPack')}</p>;
  if (!pack.enabled)
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="muted text-sm">{t('bwLibrary.off')}</p>
        <Button size="sm" onClick={() => session.packs.setPackEnabled(PACK, true)}>
          {t('bwLibrary.turnOn')}
        </Button>
      </div>
    );
  const compendia = pack.compendia.filter(browsable);
  if (!compendia.length) return <p className="muted text-sm">{t('bwLibrary.empty')}</p>;
  return <Library session={session} compendia={compendia} />;
}

function Library({ session, compendia }: Readonly<{ session: Session; compendia: Compendium[] }>) {
  const [shown, setShown] = useState((compendia.find((c) => c.type === 'prefab') ?? compendia[0]!).id);
  const compendium = compendia.find((c) => c.id === shown) ?? compendia[0]!;
  return (
    <section className="flex shrink-0 flex-col gap-2" aria-label={t('bwLibrary.title')}>
      <ToggleGroup
        type="single"
        className="w-full shrink-0 flex-wrap"
        value={compendium.id}
        onValueChange={(v) => v && setShown(v)}
      >
        {compendia.map((c) => (
          <ToggleGroupItem key={c.id} value={c.id}>
            {(c.name ?? c.id).replace(/^Baileywiki /, '')}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Shelf key={compendium.id} session={session} compendium={compendium} />
    </section>
  );
}

function Shelf({ session, compendium }: Readonly<{ session: Session; compendium: Compendium }>) {
  const [text, setText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => {
    session.packs.openCompendium(PACK, compendium.id);
  }, [session, compendium.id]);
  const docs = session.packs.compendiumDocs(PACK, compendium.id);
  const all = entriesOf(docs);
  const found = searchLibrary(all, text, tags);
  const pick = (tag: string, on: boolean) => setTags(on ? [...tags, tag] : tags.filter((x) => x !== tag));
  return (
    <>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('bwLibrary.search')} />
      <div className="flex flex-wrap gap-1">
        {[...new Set([...tags, ...libraryTags(found, TAGS)])].map((tag) => (
          <Toggle
            key={tag}
            className="h-6 px-2 text-xs"
            pressed={tags.includes(tag)}
            onPressedChange={(on) => pick(tag, on)}
          >
            {tag}
          </Toggle>
        ))}
      </div>
      {!docs && <p className="muted text-sm">{t('bwLibrary.loading')}</p>}
      <ul className="asset-grid">
        {found.slice(0, SHOWN).map((e) => (
          <Card key={e.id} session={session} compendium={compendium} entry={e} />
        ))}
      </ul>
      {found.length > SHOWN && <p className="muted text-sm">{t('bwLibrary.more', { n: found.length - SHOWN })}</p>}
      {docs && !found.length && <p className="muted text-sm">{t('bwLibrary.none')}</p>}
      <p className="muted text-sm">
        {t(compendium.type === 'prefab' ? 'bwLibrary.prefabHint' : 'bwLibrary.sceneHint')}
      </p>
    </>
  );
}

function Card({
  session,
  compendium,
  entry,
}: Readonly<{ session: Session; compendium: Compendium; entry: LibraryEntry }>) {
  const prefab = compendium.type === 'prefab';
  const ref = { pack: PACK, compendium: compendium.id, id: entry.id };
  const use = () => {
    if (prefab) session.packs.placePrefab(ref, session.editor.viewCentre());
    else void session.packs.wholeDoc(PACK, compendium.id, entry).then((doc) => session.packs.importScene(doc));
  };
  return (
    <li
      className="asset-thumb"
      title={[entry.name, ...(entry.tags ?? [])].join(' · ')}
      draggable={prefab}
      onDragStart={(e) => prefab && startDrag(e, { kind: 'prefab', ...ref })}
    >
      <Pressable className="flex w-full flex-col items-center" onClick={use} aria-label={entry.name}>
        {entry.thumb ? (
          <img src={assetUrl(entry.thumb)} alt="" loading="lazy" draggable={false} />
        ) : (
          <span className="flex h-[72px] w-full items-center justify-center bg-black/30 text-xs">
            {entry.name.slice(0, 2)}
          </span>
        )}
        <span className="asset-name">{entry.name}</span>
      </Pressable>
    </li>
  );
}
