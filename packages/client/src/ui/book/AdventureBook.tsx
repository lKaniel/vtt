import { BOOK_TABS, type BookTab } from '@vtt/shared';
import { BookOpenIcon, HourglassIcon, MapIcon, NotebookPenIcon, ScrollTextIcon } from 'lucide-react';
import { t } from '../../i18n/index.ts';
import type { Session } from '../../session/session.ts';
import { Dialog, DialogContent, DialogTitle } from '../kit/dialog.tsx';
import { Tabs, TabsList, TabsTrigger } from '../kit/tabs.tsx';
import { BookList } from './BookList.tsx';
import { BookReader } from './BookReader.tsx';

// The adventure book (J), as Simple Quest's was in Foundry: tabs across the
// top, the tab's entries down the left, the open entry on the right.

const ICONS: Record<BookTab, typeof MapIcon> = {
  quests: ScrollTextIcon,
  map: MapIcon,
  lore: BookOpenIcon,
  log: NotebookPenIcon,
  timeline: HourglassIcon,
};

export function AdventureBook({ session }: Readonly<{ session: Session }>) {
  const tab = session.book.tab;
  return (
    <Dialog open={!!tab} onOpenChange={(open) => !open && session.book.close()}>
      <DialogContent
        data-slot="adventure-book"
        aria-describedby={undefined}
        className="h-[min(780px,calc(100vh-48px))] w-[min(1120px,calc(100vw-32px))] overflow-hidden"
      >
        <DialogTitle>{t('book.title')}</DialogTitle>
        {tab && <BookBody session={session} tab={tab} />}
      </DialogContent>
    </Dialog>
  );
}

function BookBody({ session, tab }: Readonly<{ session: Session; tab: BookTab }>) {
  return (
    <Tabs value={tab} onValueChange={(v) => session.book.open(v as BookTab)} className="min-h-0 flex-1">
      <TabsList>
        {BOOK_TABS.map((id) => {
          const Icon = ICONS[id];
          return (
            <TabsTrigger key={id} value={id}>
              <Icon /> {t(`book.tab.${id}`)}
            </TabsTrigger>
          );
        })}
      </TabsList>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(200px,280px)_1fr] gap-4 max-sm:grid-cols-1">
        <BookList session={session} tab={tab} />
        <BookReader session={session} tab={tab} />
      </div>
    </Tabs>
  );
}
