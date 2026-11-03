import type { Doc } from '@vtt/core';
import { useState } from 'react';
import type { Session } from '../session/session.ts';
import { DicesIcon, EyeOffIcon, PencilIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import { t } from '../i18n/index.ts';
import { Directory, type DirItem } from './directory/Directory.tsx';
import { Button } from './kit/button.tsx';
import { Dialog, DialogContent, DialogTitle } from './kit/dialog.tsx';
import { Input } from './kit/input.tsx';
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

function tableItem(session: Session, doc: Doc, edit: (id: string) => void): DirItem {
  const drawn = resultsOf(doc).filter((r) => r.drawn).length;
  const total = resultsOf(doc).length;
  return {
    key: doc.id,
    ref: { coll: 'tables', id: doc.id },
    name: nameOf(doc),
    folder: typeof doc.folder === 'string' ? doc.folder : undefined,
    tags: { draws: doc.replacement === false ? 'once' : 'again' },
    look: {
      picture: (
        <span className="flex items-center justify-center text-gold">
          <DicesIcon className="size-4" />
        </span>
      ),
      sub: drawn ? t('tables.drawnOf', { n: drawn, of: total }) : t('tables.results', { n: total }),
    },
    open: () => edit(doc.id),
    openTwice: () => session.journal.rollTable(doc.id),
    title: t('tables.clickHint'),
    menu: [
      { label: t('tables.roll'), icon: DicesIcon, run: () => session.journal.rollTable(doc.id) },
      {
        label: t('tables.gmRoll'),
        icon: EyeOffIcon,
        title: t('tables.gmRollHint'),
        run: () => session.journal.rollTable(doc.id, true),
      },
      {
        label: t('tables.reset'),
        icon: RotateCcwIcon,
        disabled: !drawn,
        run: () => session.journal.resetTable(doc.id),
      },
      { label: t('tables.edit'), icon: PencilIcon, run: () => edit(doc.id) },
      'separator',
      {
        label: t('list.delete'),
        icon: Trash2Icon,
        danger: true,
        run: () => session.journal.deleteEntry('tables', doc.id),
      },
    ],
  };
}

/** GM: roll tables, in folders. Roll one into the chat (or for the GM alone), reset what was drawn, edit the results. */
export function TablesTab({ session }: Readonly<{ session: Session }>) {
  const [editing, setEditing] = useState<string>();
  const items = session.docs.all('tables').map((doc) => tableItem(session, doc, setEditing));
  const open = editing ? session.docs.get('tables', editing) : undefined;
  return (
    <>
      <Directory
        session={session}
        id="tables"
        items={items}
        folders={{ kind: 'tables', editable: true }}
        what={t('tables.what')}
        filters={[
          {
            key: 'draws',
            label: t('tables.draws'),
            options: [
              { value: 'again', label: t('tables.draws.again') },
              { value: 'once', label: t('tables.draws.once') },
            ],
          },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={() => session.journal.createEntry('rolltable')}>
            <PlusIcon />
            {t('tables.new')}
          </Button>
        }
        empty={t('tables.none')}
      />
      <Dialog open={!!open} onOpenChange={(on) => !on && setEditing(undefined)}>
        {open && (
          <DialogContent>
            <DialogTitle>{nameOf(open)}</DialogTitle>
            <TableEditor key={open.rev} session={session} doc={open} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function TableEditor({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const [name, setName] = useState(nameOf(doc));
  const [text, setText] = useState(toText(resultsOf(doc)));
  const save = () => {
    const results = fromText(text, resultsOf(doc));
    if (results.length) session.journal.patchEntry('tables', doc.id, { results });
  };
  return (
    <div className="table-edit">
      <Input
        value={name}
        aria-label={t('list.rename')}
        onChange={(e) => setName(e.target.value)}
        onBlur={() =>
          name.trim() &&
          name.trim() !== nameOf(doc) &&
          session.journal.patchEntry('tables', doc.id, { name: name.trim() })
        }
      />
      <Textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={save} aria-label="Results" />
      <label className="map-tools-check">
        <Checkbox
          checked={doc.replacement === false}
          onCheckedChange={(on) =>
            session.journal.patchEntry('tables', doc.id, { replacement: on === true ? false : null })
          }
        />
        Each result once (until reset)
      </label>
      <p className="muted">One result per line; "3: Gold" makes it three times as likely.</p>
    </div>
  );
}
