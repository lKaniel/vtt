import { MapIcon, MessageSquareTextIcon, ScrollTextIcon } from 'lucide-react';
import { type ComponentType, useState } from 'react';
import { t } from '../i18n/index.ts';
import { type PhoneTab, phoneTab } from '../play/phone.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { SidePanel } from './SidePanel.tsx';

// The tabs along the bottom of a phone: the map with the action bar, your
// sheet, or the log and lists of the side panel, one at a time.

const TABS: readonly { id: PhoneTab; icon: ComponentType }[] = [
  { id: 'map', icon: MapIcon },
  { id: 'sheet', icon: ScrollTextIcon },
  { id: 'log', icon: MessageSquareTextIcon },
];

/** Whose sheet the Sheet tab opens: the creature selected, else the character you play. */
function sheetToOpen(session: Session) {
  const id = session.selected ?? session.character.token()?.id;
  if (id) return { kind: 'token' as const, id };
  const actor = session.character.actor();
  return actor ? { kind: 'actor' as const, id: actor.id } : undefined;
}

/** Puts every sheet away, back to the map. */
function closeSheets(session: Session): void {
  for (const sheet of session.sheets.list) session.sheets.shut(sheet);
}

/**
 * Whether a phone shows the side panel: from a tap on Log until a sheet
 * opens over it (one opened from the panel's lists shows at once).
 */
function usePhoneLog(session: Session): [boolean, (open: boolean) => void] {
  // The number of sheets open when the log was shown; unset while it isn't.
  const [at, setAt] = useState<number>();
  const open = session.sheets.list.length;
  return [at !== undefined && open <= at, (show) => setAt(show ? open : undefined)];
}

/** On a phone: the side panel while Log is picked, and the tabs. */
export function PhoneScreens({ session }: Readonly<{ session: Session }>) {
  const [log, setLog] = usePhoneLog(session);
  return (
    <>
      <SidePanel session={session} phone={{ shown: log, onShow: () => setLog(true) }} />
      <PhoneNav session={session} log={log} onLog={setLog} />
    </>
  );
}

function PhoneNav({
  session,
  log,
  onLog,
}: Readonly<{ session: Session; log: boolean; onLog: (open: boolean) => void }>) {
  const shown = phoneTab({ log, sheet: session.sheets.list.length > 0 });
  const pick = (id: PhoneTab) => {
    onLog(id === 'log');
    if (id === 'map') closeSheets(session);
    if (id !== 'sheet' || session.sheets.current) return;
    const target = sheetToOpen(session);
    if (target) session.sheets.open(target);
  };
  return (
    <nav
      aria-label={t('phone.tabs')}
      className="art-panel fixed inset-x-0 bottom-0 z-[150] flex h-(--phone-nav) items-stretch gap-1 px-2 pt-1 pb-[max(4px,env(safe-area-inset-bottom))]"
    >
      {TABS.map(({ id, icon: Icon }) => (
        <Button
          key={id}
          variant={shown === id ? 'default' : 'ghost'}
          aria-pressed={shown === id}
          onClick={() => pick(id)}
          className="h-auto flex-1 flex-col gap-0.5 text-xs landscape:flex-row landscape:gap-2 [&_svg]:size-5"
        >
          <Icon />
          {t(`phone.${id}`)}
        </Button>
      ))}
    </nav>
  );
}
