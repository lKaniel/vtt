import type { Doc } from '@vtt/core';
import { type BookTab, formatDate } from '@vtt/shared';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { t } from '../../i18n/index.ts';
import { bookGroups, matches } from '../../text/book-view.ts';
import type { Session } from '../../session/session.ts';
import { Badge } from '../kit/badge.tsx';
import { Button } from '../kit/button.tsx';
import { Input } from '../kit/input.tsx';

// The adventure book's left-hand page: the tab's entries in groups, a
// search, and (in the party log) a new note.

interface ListProps {
  session: Session;
  tab: BookTab;
}

/** The entry the right-hand page shows: the one picked, if it is on this tab, else the first. */
export function openEntry(session: Session, tab: BookTab): Doc | undefined {
  const docs = session.book.entries(tab);
  return docs.find((d) => d.id === session.book.selected) ?? docs[0];
}

function useGroups(session: Session, tab: BookTab, query: string) {
  const { calendar } = session.time.clock();
  const folders = session.folders.of('journals');
  return bookGroups(
    tab,
    session.book.entries(tab).filter((d) => matches(d, query)),
    {
      you: session.you?.id,
      folderName: (id) => folders.find((f) => f.id === id)?.name as string | undefined,
      dateLabel: (s) => formatDate(calendar, s),
    },
  );
}

export function BookList({ session, tab }: Readonly<ListProps>) {
  const [query, setQuery] = useState('');
  const groups = useGroups(session, tab, query);
  const open = openEntry(session, tab)?.id;
  const writer = tab === 'log' && session.you?.role !== 'observer';
  return (
    <nav className="flex min-h-0 flex-col gap-2 border-r border-border pr-3" aria-label={t(`book.tab.${tab}`)}>
      <label className="relative flex items-center">
        <SearchIcon className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
        <Input
          className="w-full pl-7"
          value={query}
          placeholder={t('book.search')}
          aria-label={t('book.search')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {writer && (
        <Button variant="outline" size="sm" onClick={() => session.book.writeNote()}>
          <PlusIcon /> {t('book.newNote')}
        </Button>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {groups.map((g) => (
          <section key={g.label} className="flex flex-col gap-0.5">
            {g.label && <h4 className="font-display text-xs tracking-wider text-gold uppercase">{g.label}</h4>}
            {g.items.map(({ doc, hint }) => (
              <Button
                key={doc.id}
                variant="ghost"
                size="sm"
                aria-pressed={doc.id === open}
                className="h-auto justify-start py-1.5 text-left text-sm whitespace-normal aria-pressed:bg-gold/15 aria-pressed:text-gold-bright"
                onClick={() => session.book.select(doc.id)}
              >
                <span className="flex-1">{String(doc.name)}</span>
                {hint && <Badge variant="muted">{hint}</Badge>}
              </Button>
            ))}
          </section>
        ))}
        {!groups.length && <p className="text-sm text-muted-foreground">{t(`book.empty.${tab}`)}</p>}
      </div>
    </nav>
  );
}
