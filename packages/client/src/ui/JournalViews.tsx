import type { Doc } from '@vtt/core';
import { type Calendar, dateOf, questProgress, secondsOf } from '@vtt/shared';
import { useState } from 'react';
import { type MonthRef, monthGrid, notesByDay, stepMonth } from '../calendar-view.ts';
import { questsBy } from '../quest-view.ts';
import type { Session } from '../session.ts';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { CalendarMonth } from './kit/calendar.tsx';

// The Journal tab's other views: the quest log (quests by status, with
// their progress) and the calendar with the notes dated to each day.

const nameOf = (doc: Doc) => (typeof doc.name === 'string' ? doc.name : doc.id);

function EntryLink({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  return (
    <Button variant="link" onClick={() => session.openJournal(doc.id)}>
      {nameOf(doc)}
    </Button>
  );
}

export function QuestLog({ session }: Readonly<{ session: Session }>) {
  const groups = questsBy(session.docs.all('journals'));
  const create = () =>
    session.createEntry('journal', { name: 'New quest', quest: { status: 'active', objectives: [] } });
  return (
    <div className="flex flex-col gap-2" data-slot="quest-log">
      {session.isGm() && (
        <Button variant="outline" size="sm" onClick={create}>
          New quest
        </Button>
      )}
      {groups.map((g) => (
        <section key={g.status}>
          <h4 className="font-display text-sm text-gold">{g.label}</h4>
          <ul className="rows">
            {g.quests.map(({ doc, quest }) => {
              const { done, total } = questProgress(quest);
              return (
                <li key={doc.id} className="scene-row">
                  <EntryLink session={session} doc={doc} />
                  {total > 0 && <Badge variant={done === total ? 'good' : 'muted'}>{`${done}/${total}`}</Badge>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!groups.length && <p className="muted">No quests yet.</p>}
    </div>
  );
}

export interface DayRef extends MonthRef {
  day: number;
}

/** A month of the calendar to pick a day on; `marked` days show a dot. */
export function MonthPicker({
  calendar,
  today,
  selected,
  marked,
  onSelect,
}: Readonly<{
  calendar: Calendar;
  /** The day it is now: the month shown first. */
  today: DayRef;
  selected?: DayRef;
  marked?: (page: MonthRef) => ReadonlySet<number>;
  onSelect: (day: DayRef | undefined) => void;
}>) {
  const [page, setPage] = useState<MonthRef>({ year: (selected ?? today).year, month: (selected ?? today).month });
  const grid = monthGrid(calendar, page);
  const here = (d: MonthRef | undefined) => d?.year === page.year && d.month === page.month;
  const era = calendar.era ? ` ${calendar.era}` : '';
  return (
    <CalendarMonth
      title={`${grid.name} ${page.year}${era}`}
      weekdays={calendar.weekdays}
      days={grid.days}
      blanks={grid.blanks}
      selected={here(selected) ? selected!.day : undefined}
      today={here(today) ? today.day : undefined}
      marked={marked?.(page)}
      onSelect={(day) => onSelect({ ...page, day })}
      onPage={(by) => {
        setPage(stepMonth(calendar, page, by));
        onSelect(undefined);
      }}
      yearStep={calendar.months.length}
    />
  );
}

export function CalendarNotes({ session }: Readonly<{ session: Session }>) {
  const { calendar } = session.clock();
  const now = dateOf(calendar, session.gameTime());
  const [day, setDay] = useState<DayRef | undefined>({ year: now.year, month: now.month, day: now.day });
  const notes = session.docs.all('journals');
  const list = day ? (notesByDay(calendar, notes, day).get(day.day) ?? []) : [];
  const create = (d: DayRef) => session.createEntry('journal', { name: 'New note', date: secondsOf(calendar, d) });
  return (
    <div className="flex flex-col gap-2" data-slot="calendar-notes">
      <MonthPicker
        calendar={calendar}
        today={now}
        selected={day}
        marked={(page) => new Set(notesByDay(calendar, notes, page).keys())}
        onSelect={setDay}
      />
      {day && (
        <>
          <h4 className="font-display text-sm text-gold">
            {day.day} {calendar.months[day.month]!.name} {day.year}
          </h4>
          <ul className="rows">
            {list.map((doc) => (
              <li key={doc.id} className="scene-row">
                <EntryLink session={session} doc={doc} />
              </li>
            ))}
          </ul>
          {!list.length && <p className="muted">Nothing noted on this day.</p>}
          {session.isGm() && (
            <Button variant="outline" size="sm" onClick={() => create(day)}>
              Note on this day
            </Button>
          )}
        </>
      )}
    </div>
  );
}
