import type { Doc } from '@vtt/core';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { assetUrl } from '../assets.ts';
import { pageText } from '../text/journal-text.ts';
import type { Session } from '../session/session.ts';
import { ContentText } from './ContentText.tsx';
import { EntryHeader, EntryTools } from './JournalParts.tsx';
import { Textarea } from './kit/textarea.tsx';
import { Button } from './kit/button.tsx';
import { Tabs, TabsList, TabsTrigger } from './kit/tabs.tsx';
import { Window } from './kit/window.tsx';
import type { Size } from './kit/window-stack.ts';

export interface Page {
  id: string;
  name: string;
  kind?: 'text' | 'image';
  text?: string;
  src?: string;
}

/** The journal entry open in the viewer: its pages as tabs; the GM edits them. */
export function JournalViewer({ session }: Readonly<{ session: Session }>) {
  const open = session.journal.current;
  const doc = open && session.docs.get('journals', open.entry);
  if (!open || !doc) return null;
  return <Entry key={`${doc.id}:${open.page ?? ''}`} session={session} doc={doc} start={open.page} />;
}

function Entry({ session, doc, start }: Readonly<{ session: Session; doc: Doc; start?: string }>) {
  const pages = (doc.pages as Page[] | undefined) ?? [];
  const [pageId, setPageId] = useState(start ?? pages[0]?.id);
  const page = pages.find((p) => p.id === pageId) ?? pages[0];
  const gm = session.isGm();
  const setPages = (next: Page[]) => session.journal.patchEntry('journals', doc.id, { pages: next });
  const addPage = () => {
    const id = `page-${pages.length + 1}`;
    setPages([...pages, { id, name: `Page ${pages.length + 1}`, kind: 'text', text: '' }]);
    setPageId(id);
  };
  return (
    <Window
      id="journal"
      kind="journal"
      initial={journalPlace}
      role="dialog"
      title={String(doc.name)}
      onClose={() => session.journal.close()}
      resizable
      className="journal"
      bodyClassName="px-3 pt-1 pb-3"
    >
      <div className="mb-2 flex items-end gap-1">
        <PageTabs pages={pages} value={page?.id} onChange={setPageId} />
        {gm && (
          <>
            <EntryTools session={session} doc={doc} />
            <Button variant="ghost" size="sm" onClick={addPage}>
              <PlusIcon /> Page
            </Button>
          </>
        )}
      </div>
      <EntryHeader session={session} doc={doc} />
      {page ? (
        <PageView
          key={page.id}
          session={session}
          page={page}
          onChange={(p) => setPages(pages.map((x) => (x.id === p.id ? p : x)))}
        />
      ) : (
        <p className="muted">{gm ? 'Add a page.' : 'You may know of this, but not what it says.'}</p>
      )}
    </Window>
  );
}

/** An entry's pages as tabs to turn between. */
export function PageTabs({
  pages,
  value,
  onChange,
}: Readonly<{ pages: Page[]; value?: string; onChange: (id: string) => void }>) {
  return (
    <Tabs value={value ?? ''} onValueChange={onChange} className="min-w-0 flex-1">
      <TabsList className="flex-wrap">
        {pages.map((p) => (
          <TabsTrigger key={p.id} value={p.id} className="flex-none px-2 pb-1.5 text-[13px]">
            {p.name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Centred near the top, until moved. */
const journalPlace = (view: Size) => {
  const w = Math.min(560, view.width - 32);
  return { x: Math.round((view.width - w) / 2), y: Math.round(view.height * 0.1), w };
};

interface PageProps {
  session: Session;
  page: Page;
  onChange: (p: Page) => void;
  /** Whether you may edit the text: by default, when you are the GM. */
  editable?: boolean;
}

/** A page: a picture, or text with its links and rolls live; whoever may edit it switches to editing the text. */
export function PageView({ session, page, onChange, editable = session.isGm() }: Readonly<PageProps>) {
  const [editing, setEditing] = useState(editable && !page.text);
  if (page.kind === 'image' && page.src)
    return <img className="journal-image" src={assetUrl(page.src)} alt={page.name} />;
  const text = <ContentText session={session} text={pageText(page.text ?? '')} className="rich journal-text" />;
  if (!editable) return text;
  return (
    <>
      {editing ? <PageEditor page={page} onChange={onChange} /> : text}
      <Button variant="ghost" size="sm" className="self-start" onClick={() => setEditing(!editing)}>
        {editing ? 'Done' : 'Edit text'}
      </Button>
    </>
  );
}

function PageEditor({ page, onChange }: Readonly<Pick<PageProps, 'page' | 'onChange'>>) {
  const [draft, setDraft] = useState(page.text ?? '');
  return (
    <Textarea
      className="journal-edit"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== page.text && onChange({ ...page, text: draft })}
      aria-label="Page text"
      placeholder="Links: @journal[id]{label}, @actor[id], @spell[fireball]. Rolls: [[/r 2d6]], [[/check perception 15]]."
    />
  );
}
