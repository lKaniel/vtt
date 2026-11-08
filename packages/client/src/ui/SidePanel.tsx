import { ExternalLinkIcon, PanelRightCloseIcon, PanelRightOpenIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../i18n/index.ts';
import { readPref, writePref } from '../prefs.ts';
import type { Session } from '../session/session.ts';
import { PanelPage } from './ChatPanel.tsx';
import { Button } from './kit/button.tsx';
import { Tabs, TabsList, TabsTrigger } from './kit/tabs.tsx';
import { Window } from './kit/window.tsx';
import type { Size } from './kit/window-stack.ts';
import { PLAYER_TABS, TAB_ICONS, TABS, type Tab } from './panel-tabs.ts';

// The side panel down the right edge (Foundry's sidebar): the log and the
// lists in tabs, folded into a strip of tab icons, and any tab popped out
// into a window of its own to keep beside another.

/** Players get Cards when some are shared with them, and the Compendium when they may edit a creature (trusted owners), to fill their sheets from. */
function playerTabs(session: Session): readonly Tab[] {
  const cards: Tab[] = session.cards.stacks().length ? ['Cards'] : [];
  const compendium: Tab[] = [...session.tokens.keys()].some((id) => session.canEdit(id)) ? ['Compendium'] : [];
  return [...PLAYER_TABS, ...cards, ...compendium];
}

/** The side panel's tab and whether it is folded, as left in this browser. */
function usePanelState(): [Tab, (tab: Tab) => void, boolean, (open: boolean) => void] {
  const [tab, setTab] = useState<Tab>(() => readPref('sidebar-tab', TABS, 'Adventure log'));
  const [open, setOpen] = useState(() => readPref('sidebar', ['open', 'folded'], 'open') === 'open');
  return [
    tab,
    (next) => {
      setTab(next);
      writePref('sidebar-tab', next);
    },
    open,
    (next) => {
      setOpen(next);
      writePref('sidebar', next ? 'open' : 'folded');
    },
  ];
}

/** The side panel down the right edge, top to bottom (as Foundry's sidebar); folded, it is a strip of its tab icons. */
export function SidePanel({ session }: Readonly<{ session: Session }>) {
  const [tab, setTab, open, setOpen] = usePanelState();
  const [popped, setPopped] = useState<readonly Tab[]>([]);
  const tabs = session.isGm() ? TABS : playerTabs(session);
  const shown = tabs.includes(tab) ? tab : 'Adventure log';
  const fold = <FoldButton open={open} onClick={() => setOpen(!open)} />;
  const pick = (id: Tab) => {
    setTab(id);
    setOpen(true);
  };
  // Every render: `pick` and `tabs` are new each time, and a listener costs nothing to swap.
  useEffect(() => session.on('panel', (id) => tabs.includes(id as Tab) && pick(id as Tab)));
  const popOut = () => !popped.includes(shown) && setPopped([...popped, shown]);
  return (
    <>
      <aside className={`chat frame${open ? '' : ' closed'}`}>
        {open ? (
          <header className="chat-head">
            <span className="flex-1">{t(`panel.${shown}`)}</span>
            <PopOutButton onClick={popOut} />
            {fold}
          </header>
        ) : (
          fold
        )}
        <PanelTabs tabs={tabs} shown={open ? shown : undefined} onPick={pick} />
        {open && <PanelPage tab={shown} session={session} />}
      </aside>
      {popped
        .filter((id) => tabs.includes(id))
        .map((id, n) => (
          <TabWindow
            key={id}
            tab={id}
            session={session}
            offset={n}
            onClose={() => setPopped(popped.filter((p) => p !== id))}
          />
        ))}
    </>
  );
}

/** A side panel tab in a window of its own, beside the panel. */
function TabWindow({
  tab,
  session,
  offset,
  onClose,
}: Readonly<{ tab: Tab; session: Session; offset: number; onClose: () => void }>) {
  return (
    <Window
      id={`panel:${tab}`}
      kind={`panel-${tab}`}
      initial={tabWindowPlace}
      offset={offset}
      role="dialog"
      title={t(`panel.${tab}`)}
      onClose={onClose}
      resizable
      className="chat-window"
      bodyClassName="px-3 pb-3"
    >
      <PanelPage tab={tab} session={session} />
    </Window>
  );
}

/** Left of the side panel, as tall as most of the screen, until moved. */
const tabWindowPlace = (view: Size) => ({
  x: Math.max(8, view.width - 336 - 330),
  y: 60,
  w: 320,
  h: Math.min(640, view.height - 120),
});

function PopOutButton({ onClick }: Readonly<{ onClick: () => void }>) {
  const label = t('panel.popOut');
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label} title={label}>
      <ExternalLinkIcon />
    </Button>
  );
}

function FoldButton({ open, onClick }: Readonly<{ open: boolean; onClick: () => void }>) {
  const label = t(open ? 'panel.hide' : 'panel.show');
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label} title={label}>
      {open ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
    </Button>
  );
}

/** The tab icons: one row over the open panel, or the folded panel's column (none chosen). */
function PanelTabs({
  tabs,
  shown,
  onPick,
}: Readonly<{ tabs: readonly Tab[]; shown?: Tab; onPick: (tab: Tab) => void }>) {
  return (
    <Tabs value={shown ?? ''} onValueChange={(v) => onPick(v as Tab)} orientation={shown ? 'horizontal' : 'vertical'}>
      <TabsList className={shown ? 'mb-1.5' : 'h-auto flex-col items-stretch gap-1 border-b-0 pt-1'}>
        {tabs.map((id) => (
          <TabIcon key={id} id={id} />
        ))}
      </TabsList>
    </Tabs>
  );
}

function TabIcon({ id }: Readonly<{ id: Tab }>) {
  const Icon = TAB_ICONS[id];
  const name = t(`panel.${id}`);
  return (
    <TabsTrigger value={id} title={name} aria-label={name} className="px-1 pt-0.5 pb-1.5 [&_svg]:size-4">
      <Icon />
    </TabsTrigger>
  );
}
