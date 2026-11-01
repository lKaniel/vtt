import type { Doc } from '@vtt/core';
import { useState } from 'react';
import { assetUrl } from '../assets.ts';
import { pageText } from '../journal-text.ts';
import type { Session } from '../session.ts';
import { RichText } from './creator/Parts.tsx';

interface Page {
  id: string;
  name: string;
  kind?: 'text' | 'image';
  text?: string;
  src?: string;
}

/** The journal entry open in the viewer: its pages as tabs; the GM edits them. */
export function JournalViewer({ session }: Readonly<{ session: Session }>) {
  const open = session.journal;
  const doc = open && session.docs.get('journals', open.entry);
  if (!open || !doc) return null;
  return <Entry key={`${doc.id}:${open.page ?? ''}`} session={session} doc={doc} start={open.page} />;
}

function Entry({ session, doc, start }: Readonly<{ session: Session; doc: Doc; start?: string }>) {
  const pages = (doc.pages as Page[] | undefined) ?? [];
  const [pageId, setPageId] = useState(start ?? pages[0]?.id);
  const page = pages.find((p) => p.id === pageId) ?? pages[0];
  const gm = session.isGm();
  const setPages = (next: Page[]) => session.patchEntry('journals', doc.id, { pages: next });
  const addPage = () => {
    const id = `page-${pages.length + 1}`;
    setPages([...pages, { id, name: `Page ${pages.length + 1}`, kind: 'text', text: '' }]);
    setPageId(id);
  };
  return (
    <div className="journal frame" role="dialog" aria-label={String(doc.name)}>
      <header className="chat-head">
        <span>{String(doc.name)}</span>
        <button className="close" onClick={() => session.closeJournal()} aria-label="Close">
          ×
        </button>
      </header>
      <nav className="side-tabs">
        {pages.map((p) => (
          <button key={p.id} className={p.id === page?.id ? 'on' : ''} onClick={() => setPageId(p.id)}>
            {p.name}
          </button>
        ))}
        {gm && <button onClick={addPage}>+ Page</button>}
      </nav>
      {page ? (
        <PageView page={page} gm={gm} onChange={(p) => setPages(pages.map((x) => (x.id === p.id ? p : x)))} />
      ) : (
        <p className="muted">{gm ? 'Add a page.' : 'You may know of this, but not what it says.'}</p>
      )}
    </div>
  );
}

function PageView({ page, gm, onChange }: Readonly<{ page: Page; gm: boolean; onChange: (p: Page) => void }>) {
  const [draft, setDraft] = useState(page.text ?? '');
  if (page.kind === 'image' && page.src)
    return <img className="journal-image" src={assetUrl(page.src)} alt={page.name} />;
  if (!gm) return <RichText text={pageText(page.text ?? '')} className="rich journal-text" />;
  return (
    <textarea
      className="journal-edit"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== page.text && onChange({ ...page, text: draft })}
      aria-label="Page text"
    />
  );
}
