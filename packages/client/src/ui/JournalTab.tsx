import type { Doc } from '@vtt/core';
import { useState } from 'react';
import type { Session } from '../session/session.ts';
import {
  BookOpenIcon,
  CalendarDaysIcon,
  FlagIcon,
  LockIcon,
  PlusIcon,
  PresentationIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react';
import { t } from '../i18n/index.ts';
import { startDrag } from '../play/drops.ts';
import { Directory, type DirItem } from './directory/Directory.tsx';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';
import { CalendarNotes, QuestLog } from './JournalViews.tsx';

const nameOf = (doc: Doc) => (typeof doc.name === 'string' ? doc.name : doc.id);
const shared = (doc: Doc) => {
  const level = (doc.ownership as { default?: string } | undefined)?.default;
  return level === 'observer' || level === 'owner';
};

type View = 'entries' | 'quests' | 'calendar';

/** Journal entries, the quest log, or the calendar with its dated notes. */
export function JournalTab({ session }: Readonly<{ session: Session }>) {
  const [view, setView] = useState<View>('entries');
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as View)}>
        <ToggleGroupItem value="entries">Entries</ToggleGroupItem>
        <ToggleGroupItem value="quests">Quests</ToggleGroupItem>
        <ToggleGroupItem value="calendar">Calendar</ToggleGroupItem>
      </ToggleGroup>
      {view === 'entries' && <Entries session={session} />}
      {view === 'quests' && <QuestLog session={session} />}
      {view === 'calendar' && <CalendarNotes session={session} />}
    </div>
  );
}

/** What an entry is, for the filter and its picture. */
function typeOf(doc: Doc): 'quest' | 'dated' | 'entry' {
  if (doc.quest) return 'quest';
  return typeof doc.date === 'number' ? 'dated' : 'entry';
}

const PICTURE = { quest: FlagIcon, dated: CalendarDaysIcon, entry: BookOpenIcon } as const;

function entryItem(session: Session, doc: Doc): DirItem {
  const gm = session.isGm();
  const type = typeOf(doc);
  const Icon = PICTURE[type];
  const share = () =>
    session.journal.patchEntry('journals', doc.id, { ownership: shared(doc) ? null : { default: 'observer' } });
  return {
    key: doc.id,
    ref: { coll: 'journals', id: doc.id },
    name: nameOf(doc),
    folder: typeof doc.folder === 'string' ? doc.folder : undefined,
    tags: { type, ...(gm ? { shared: shared(doc) ? 'yes' : 'no' } : {}) },
    look: {
      picture: (
        <span className="flex items-center justify-center text-gold">
          <Icon className="size-4" />
        </span>
      ),
      sub: t(`journal.type.${type}`),
      badge: gm && shared(doc) && <Badge variant="muted">{t('journal.shared')}</Badge>,
    },
    open: () => session.journal.open(doc.id),
    ...(gm ? { drag: (e: React.DragEvent) => startDrag(e, { kind: 'journal', id: doc.id, name: nameOf(doc) }) } : {}),
    title: gm ? t('journal.dragHint') : undefined,
    menu: [
      { label: t('journal.open'), icon: BookOpenIcon, run: () => session.journal.open(doc.id) },
      ...(gm
        ? ([
            {
              label: t(shared(doc) ? 'journal.unshare' : 'journal.share'),
              icon: shared(doc) ? LockIcon : UsersIcon,
              run: share,
            },
            { label: t('journal.show'), icon: PresentationIcon, run: () => session.journal.show(doc.id) },
            'separator',
            {
              label: t('list.delete'),
              icon: Trash2Icon,
              danger: true,
              run: () => session.journal.deleteEntry('journals', doc.id),
            },
          ] as const)
        : []),
    ],
  };
}

/**
 * Journal entries: handouts and the GM's notes, in folders. Everyone opens
 * the entries they may see; the GM adds them, shares them with the players
 * (their pages then show), shows one on every player's screen, and drags
 * one onto the map to pin a note that opens it.
 */
function Entries({ session }: Readonly<{ session: Session }>) {
  const gm = session.isGm();
  const items = session.docs.all('journals').map((doc) => entryItem(session, doc));
  return (
    <Directory
      session={session}
      id="journals"
      items={items}
      folders={{ kind: 'journals', editable: gm }}
      what={t('journal.what')}
      filters={[
        {
          key: 'type',
          label: t('journal.type'),
          options: (['entry', 'quest', 'dated'] as const).map((v) => ({ value: v, label: t(`journal.type.${v}`) })),
        },
        ...(gm
          ? [
              {
                key: 'shared',
                label: t('journal.sharing'),
                options: [
                  { value: 'yes', label: t('journal.shared') },
                  { value: 'no', label: t('journal.private') },
                ],
              },
            ]
          : []),
      ]}
      actions={
        gm && (
          <Button variant="outline" size="sm" onClick={() => session.journal.createEntry('journal')}>
            <PlusIcon />
            {t('journal.new')}
          </Button>
        )
      }
      empty={t(gm ? 'journal.none' : 'journal.noneShared')}
    />
  );
}
