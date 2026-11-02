import type { Doc } from '@vtt/core';
import { dateOf, formatDate, type Quest, secondsOf, toggleObjective } from '@vtt/shared';
import { CalendarIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { addObjective, QUEST_STATUS, questOf, removeObjective } from '../quest-view.ts';
import type { Session } from '../session.ts';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { Checkbox } from './kit/checkbox.tsx';
import { Input } from './kit/input.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';
import { MonthPicker } from './JournalViews.tsx';

// What sits above a journal entry's pages: the day a calendar note is dated
// to, and a quest's status and objectives. The GM changes them; players read.

interface PartProps {
  session: Session;
  doc: Doc;
}

const patch = (session: Session, doc: Doc, fields: Record<string, unknown>) =>
  session.journal.patchEntry('journals', doc.id, fields);

/** The GM's buttons to date the entry and to make it a quest (or not). */
export function EntryTools({ session, doc }: Readonly<PartProps>) {
  const quest = doc.quest !== undefined;
  return (
    <>
      <DateButton session={session} doc={doc} />
      <Button
        variant="ghost"
        size="sm"
        title={quest ? 'Take it out of the quest log' : 'Put it in the quest log'}
        onClick={() => patch(session, doc, { quest: quest ? null : { status: 'active', objectives: [] } })}
      >
        {quest ? 'Not a quest' : 'Quest'}
      </Button>
    </>
  );
}

function DateButton({ session, doc }: Readonly<PartProps>) {
  const { calendar } = session.clock();
  const date = typeof doc.date === 'number' ? dateOf(calendar, doc.date) : undefined;
  const today = dateOf(calendar, session.gameTime());
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" title="Date it on the calendar">
          <CalendarIcon /> Date
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-[320px] flex-col gap-2">
        <MonthPicker
          calendar={calendar}
          today={today}
          selected={date}
          onSelect={(d) => d && patch(session, doc, { date: secondsOf(calendar, d) })}
        />
        {date && (
          <Button variant="outline" size="sm" onClick={() => patch(session, doc, { date: null })}>
            Remove the date
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The day the entry is dated to, and its quest. */
export function EntryHeader({ session, doc }: Readonly<PartProps>) {
  const quest = questOf(doc);
  const { calendar } = session.clock();
  return (
    <>
      {typeof doc.date === 'number' && (
        <p className="mb-1 flex items-center gap-1 text-sm text-muted-foreground" data-slot="note-date">
          <CalendarIcon className="size-3.5" />
          {formatDate(calendar, doc.date)}
        </p>
      )}
      {quest && <QuestPanel session={session} doc={doc} quest={quest} />}
    </>
  );
}

function QuestPanel({ session, doc, quest }: Readonly<PartProps & { quest: Quest }>) {
  const gm = session.isGm();
  const [draft, setDraft] = useState('');
  const set = (next: Quest) => patch(session, doc, { quest: next });
  const label = QUEST_STATUS.find((s) => s.status === quest.status)!.label;
  return (
    <section className="mb-2 flex flex-col gap-1.5 border-b border-border pb-2" data-slot="quest">
      {gm ? (
        <ToggleGroup
          type="single"
          value={quest.status}
          onValueChange={(v) => v && set({ ...quest, status: v as Quest['status'] })}
        >
          {QUEST_STATUS.map((s) => (
            <ToggleGroupItem key={s.status} value={s.status}>
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : (
        <Badge variant={quest.status === 'active' ? 'default' : 'muted'}>{label}</Badge>
      )}
      <ul className="flex flex-col gap-1">
        {quest.objectives.map((o, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={!!o.done}
              disabled={!gm}
              onCheckedChange={() => set(toggleObjective(quest, i))}
              aria-label={o.text}
            />
            <span className={o.done ? 'text-muted-foreground line-through' : ''}>{o.text}</span>
            {gm && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                title="Remove"
                onClick={() => set(removeObjective(quest, i))}
              >
                <XIcon />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {gm && (
        <Input
          value={draft}
          placeholder="New objective, then Enter"
          aria-label="New objective"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            set(addObjective(quest, draft));
            setDraft('');
          }}
        />
      )}
    </section>
  );
}
