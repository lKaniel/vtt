import type { Doc } from '@vtt/core';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { assetUrl } from '../assets.ts';
import { pageText } from '../journal-text.ts';
import type { Session } from '../session.ts';
import { ContentText } from './ContentText.tsx';
import { EntryHeader, EntryTools } from './JournalParts.tsx';
import { Textarea } from './kit/textarea.tsx';
import { Button } from './kit/button.tsx';
import { Tabs, TabsList, TabsTrigger } from './kit/tabs.tsx';

interface Page {
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
    <div className="journal frame" role="dialog" aria-label={String(doc.name)}>
      <header className="chat-head">
        <span>{String(doc.name)}</span>
        <Button variant="close" onClick={() => session.journal.close()} aria-label="Close" title="Close" />
      </header>
      <div className="mb-2 flex items-end gap-1">
        <Tabs value={page?.id ?? ''} onValueChange={setPageId} className="min-w-0 flex-1">
          <TabsList className="flex-wrap">
            {pages.map((p) => (
              <TabsTrigger key={p.id} value={p.id} className="flex-none px-2 pb-1.5 text-[13px]">
                {p.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
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
    </div>
  );
}

interface PageProps {
  session: Session;
  page: Page;
  onChange: (p: Page) => void;
}

/** A page: a picture, or text with its links and rolls live; the GM switches to editing the text. */
function PageView({ session, page, onChange }: Readonly<PageProps>) {
  const gm = session.isGm();
  const [editing, setEditing] = useState(gm && !page.text);
  if (page.kind === 'image' && page.src)
    return <img className="journal-image" src={assetUrl(page.src)} alt={page.name} />;
  const text = <ContentText session={session} text={pageText(page.text ?? '')} className="rich journal-text" />;
  if (!gm) return text;
  return (
    <>
      {editing ? <PageEditor page={page} onChange={onChange} /> : text}
      <Button variant="ghost" size="sm" className="self-start" onClick={() => setEditing(!editing)}>
        {editing ? 'Done' : 'Edit text'}
      </Button>
    </>
  );
}

function PageEditor({ page, onChange }: Readonly<Omit<PageProps, 'session'>>) {
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
