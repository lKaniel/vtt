import type { Doc } from '@vtt/core';
import { useState } from 'react';
import type { Session } from '../session.ts';

interface Result {
  text: string;
  weight?: number;
  drawn?: boolean;
}

const nameOf = (doc: Doc) => (typeof doc.name === 'string' ? doc.name : doc.id);
const resultsOf = (doc: Doc) => (doc.results as Result[] | undefined) ?? [];

/** One result per line; "3: Gold" gives it a weight of 3. */
function toText(results: Result[]): string {
  return results.map((r) => (r.weight && r.weight > 1 ? `${r.weight}: ${r.text}` : r.text)).join('\n');
}

function fromText(text: string, old: Result[]): Result[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(':');
      const weight = colon > 0 ? Number(line.slice(0, colon)) : Number.NaN;
      const r: Result =
        Number.isInteger(weight) && weight > 0 ? { text: line.slice(colon + 1).trim(), weight } : { text: line };
      return old.find((o) => o.text === r.text)?.drawn ? { ...r, drawn: true } : r;
    });
}

/** GM: roll tables. Roll one into the chat (or for the GM alone), reset what was drawn, edit the results. */
export function TablesTab({ session }: Readonly<{ session: Session }>) {
  const [open, setOpen] = useState<string>();
  const tables = session.docs.all('tables').sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  return (
    <div className="scenes-tab">
      <button className="btn small" onClick={() => session.createEntry('rolltable')}>
        New table
      </button>
      <ul className="rows">
        {tables.map((doc) => (
          <li key={doc.id} className="scene-row">
            <button className="link" onClick={() => setOpen(open === doc.id ? undefined : doc.id)}>
              {nameOf(doc)}
            </button>
            <span className="row-actions">
              <button className="btn small" onClick={() => session.rollTable(doc.id)}>
                Roll
              </button>
              <button
                className="btn small"
                title="Only you see the result"
                onClick={() => session.rollTable(doc.id, true)}
              >
                GM roll
              </button>
              {resultsOf(doc).some((r) => r.drawn) && (
                <button className="btn small" onClick={() => session.resetTable(doc.id)}>
                  Reset
                </button>
              )}
            </span>
            {open === doc.id && <TableEditor key={doc.rev} session={session} doc={doc} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TableEditor({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const [text, setText] = useState(toText(resultsOf(doc)));
  const save = () => {
    const results = fromText(text, resultsOf(doc));
    if (results.length) session.patchEntry('tables', doc.id, { results });
  };
  return (
    <div className="table-edit">
      <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={save} aria-label="Results" />
      <label className="map-tools-check">
        <input
          type="checkbox"
          checked={doc.replacement === false}
          onChange={(e) => session.patchEntry('tables', doc.id, { replacement: e.target.checked ? false : null })}
        />
        Each result once (until reset)
      </label>
      <p className="muted">One result per line; "3: Gold" makes it three times as likely.</p>
    </div>
  );
}
