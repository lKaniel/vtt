import type { Doc } from '@vtt/core';
import type { BookTab } from '@vtt/shared';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { assetUrl } from '../../assets.ts';
import { pageText } from '../../text/journal-text.ts';
import { ContentText } from '../ContentText.tsx';
import { t } from '../../i18n/index.ts';
import type { Session } from '../../session/session.ts';
import { Button } from '../kit/button.tsx';
import { Input } from '../kit/input.tsx';
import { SelectField } from '../kit/select.tsx';
import { Switch } from '../kit/switch.tsx';
import { EntryHeader, EntryTools } from '../JournalParts.tsx';
import { type Page, PageTabs, PageView } from '../JournalViewer.tsx';
import { openEntry } from './BookList.tsx';

// The adventure book's right-hand page: the open entry. Maps show their
// pictures large; other entries show their pages as tabs. You write in
// your own notes (the GM in anything), and share them with the party.

interface ReaderProps {
  session: Session;
  tab: BookTab;
}

const pagesOf = (doc: Doc) => (doc.pages as Page[] | undefined) ?? [];

export function BookReader({ session, tab }: Readonly<ReaderProps>) {
  const doc = openEntry(session, tab);
  if (!doc) return <p className="text-sm text-muted-foreground">{t('book.pick')}</p>;
  return <Entry key={doc.id} session={session} doc={doc} tab={tab} />;
}

function Entry({ session, doc, tab }: Readonly<ReaderProps & { doc: Doc }>) {
  const writable = session.book.canWrite(doc.id);
  return (
    <article className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1" aria-label={String(doc.name)}>
      <EntryTitle session={session} doc={doc} writable={writable} />
      <Byline session={session} doc={doc} />
      {session.isGm() && <GmTools session={session} doc={doc} />}
      {writable && typeof doc.author === 'string' && <NoteTools session={session} doc={doc} />}
      <EntryHeader session={session} doc={doc} />
      {tab === 'map' ? (
        <MapPages session={session} doc={doc} />
      ) : (
        <Pages session={session} doc={doc} writable={writable} />
      )}
    </article>
  );
}

interface EntryProps {
  session: Session;
  doc: Doc;
}

function EntryTitle({ session, doc, writable }: Readonly<EntryProps & { writable: boolean }>) {
  const [name, setName] = useState(String(doc.name));
  if (!writable) return <h2 className="font-display text-xl text-gold-bright">{String(doc.name)}</h2>;
  const save = () => name.trim() && name !== doc.name && session.book.patch(doc.id, { name: name.trim() }, 'rename');
  return (
    <Input
      className="h-9 font-display text-lg text-gold-bright"
      value={name}
      aria-label={t('book.name')}
      onChange={(e) => setName(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && save()}
    />
  );
}

function Byline({ session, doc }: Readonly<EntryProps>) {
  if (typeof doc.author !== 'string') return null;
  const you = session.you?.id === doc.author ? session.you.name : undefined;
  const name = you ?? session.players.find((p) => p.id === doc.author)?.name ?? doc.author;
  return <p className="text-xs text-muted-foreground italic">{t('book.byAuthor', { name })}</p>;
}

const SHELVES = ['', 'map', 'log'] as const;

/** The GM's tools: which shelf the entry sits on, its date, whether it is a quest. */
function GmTools({ session, doc }: Readonly<EntryProps>) {
  const shelf = typeof doc.book === 'string' ? doc.book : '';
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t('book.shelf')}</span>
      <SelectField
        className="w-36"
        aria-label={t('book.shelf')}
        value={shelf}
        options={SHELVES.map((s) => ({ value: s, label: t(s ? `book.shelf.${s}` : 'book.shelf.none') }))}
        onValueChange={(v) => session.book.patch(doc.id, { book: v || null }, 'shelve')}
      />
      <EntryTools session={session} doc={doc} />
    </div>
  );
}

/** Your own note: share it with the party, or tear it out. */
function NoteTools({ session, doc }: Readonly<EntryProps>) {
  const shared = (doc.ownership as { default?: string } | undefined)?.default === 'observer';
  return (
    <div className="flex items-center gap-2 text-sm">
      <Switch checked={shared} onCheckedChange={(on) => session.book.share(doc.id, on)} aria-label={t('book.share')} />
      <span>{t('book.share')}</span>
      <Button variant="ghost" size="sm" className="ml-auto" onClick={() => session.book.deleteNote(doc.id)}>
        <Trash2Icon /> {t('book.delete')}
      </Button>
    </div>
  );
}

/** A map entry: each picture large, then its notes. */
function MapPages({ session, doc }: Readonly<EntryProps>) {
  return (
    <div className="flex flex-col gap-3">
      {pagesOf(doc).map((p) =>
        p.kind === 'image' && p.src ? (
          <figure key={p.id} className="flex flex-col gap-1">
            <img className="w-full rounded-md border border-border object-contain" src={assetUrl(p.src)} alt={p.name} />
            <figcaption className="text-center font-display text-sm text-gold">{p.name}</figcaption>
          </figure>
        ) : (
          <ContentText key={p.id} session={session} text={pageText(p.text ?? '')} className="rich journal-text" />
        ),
      )}
    </div>
  );
}

/** The entry's pages as tabs; whoever may write adds pages and edits their text. */
function Pages({ session, doc, writable }: Readonly<EntryProps & { writable: boolean }>) {
  const pages = pagesOf(doc);
  const [pageId, setPageId] = useState(pages[0]?.id);
  const page = pages.find((p) => p.id === pageId) ?? pages[0];
  const setPages = (next: Page[]) => session.book.patch(doc.id, { pages: next });
  const addPage = () => {
    const id = `page-${pages.length + 1}`;
    setPages([...pages, { id, name: `${t('book.newPage')} ${pages.length + 1}`, kind: 'text', text: '' }]);
    setPageId(id);
  };
  return (
    <>
      {(pages.length > 1 || writable) && (
        <div className="flex items-end gap-1">
          <PageTabs pages={pages} value={page?.id} onChange={setPageId} />
          {writable && (
            <Button variant="ghost" size="sm" onClick={addPage}>
              <PlusIcon /> {t('book.newPage')}
            </Button>
          )}
        </div>
      )}
      {page && (
        <PageView
          key={page.id}
          session={session}
          page={page}
          editable={writable}
          onChange={(p) => setPages(pages.map((x) => (x.id === p.id ? p : x)))}
        />
      )}
    </>
  );
}
