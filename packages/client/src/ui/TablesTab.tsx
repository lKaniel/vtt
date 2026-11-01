import type { Doc } from '@vtt/core';
import { useState } from 'react';
import type { Session } from '../session.ts';
import { Button } from './kit/button.tsx';
import { Textarea } from './kit/textarea.tsx';
import { Checkbox } from './kit/checkbox.tsx';

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
      <Button variant="outline" size="sm" onClick={() => session.createEntry('rolltable')}>
        New table
      </Button>
      <ul className="rows">
        {tables.map((doc) => (
          <li key={doc.id} className="scene-row">
            <Button variant="link" onClick={() => setOpen(open === doc.id ? undefined : doc.id)}>
              {nameOf(doc)}
            </Button>
            <span className="row-actions">
              <Button variant="outline" size="sm" onClick={() => session.rollTable(doc.id)}>
                Roll
              </Button>
              <Button
                variant="outline"
                size="sm"
                title="Only you see the result"
                onClick={() => session.rollTable(doc.id, true)}
              >
                GM roll
              </Button>
              {resultsOf(doc).some((r) => r.drawn) && (
                <Button variant="outline" size="sm" onClick={() => session.resetTable(doc.id)}>
                  Reset
                </Button>
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
      <Textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={save} aria-label="Results" />
      <label className="map-tools-check">
        <Checkbox
          checked={doc.replacement === false}
          onCheckedChange={(on) => session.patchEntry('tables', doc.id, { replacement: on === true ? false : null })}
        />
        Each result once (until reset)
      </label>
      <p className="muted">One result per line; "3: Gold" makes it three times as likely.</p>
    </div>
  );
}
