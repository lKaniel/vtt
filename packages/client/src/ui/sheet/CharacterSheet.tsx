import { type Creature, type Edition, editionOf, type SheetArea } from '@vtt/system-dnd5e';
import {
  BackpackIcon,
  BookOpenIcon,
  ClapperboardIcon,
  FeatherIcon,
  type LucideIcon,
  ListIcon,
  SettingsIcon,
  UserRoundCogIcon,
  ZapIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { t } from '../../i18n/index.ts';
import type { MessageKey } from '../../i18n/en.ts';
import type { Session } from '../../session/session.ts';
import type { SheetTarget } from '../../session/session-sheets.ts';
import { tokenPatch } from '../../play/token-edit.ts';
import { previewSheet, type Draft } from '../sheet-model.ts';
import { useAutoSave } from '../useAutoSave.ts';
import { Tabs, TabsList, TabsTrigger } from '../kit/tabs.tsx';
import { AbilityRow } from './AbilityRow.tsx';
import { AnimationsPage } from './AnimationsPage.tsx';
import { BiographyTab } from './BiographyTab.tsx';
import { DetailsTab } from './DetailsTab.tsx';
import { EffectsTab } from './EffectsTab.tsx';
import { FeaturesTab } from './FeaturesTab.tsx';
import { InventoryTab } from './InventoryTab.tsx';
import { SheetFoot } from './SheetFoot.tsx';
import { SheetHeader, type SheetControls } from './SheetHeader.tsx';
import { SheetSidebar } from './SheetSidebar.tsx';
import { SpellsTab } from './SpellsTab.tsx';
import { TokenTab } from './TokenTab.tsx';
import { sheetDropTarget } from './sheet-drop.ts';
import type { SheetProps } from './sheet-props.ts';

export type { SheetControls } from './SheetHeader.tsx';

// The character sheet, laid out like Foundry's dnd5e sheet: the name, level
// and rests across the top with the six abilities under them, the portrait
// and vitals down the left, and the tabs (icons down the right edge) for
// skills, gear, features, spells, effects, the biography and animations. Edit mode, a
// switch in the header, turns every number into a field that saves itself.

const TABS = ['details', 'inventory', 'features', 'spells', 'effects', 'biography', 'animations', 'token'] as const;
type Tab = (typeof TABS)[number];

const TAB_ICON: Record<Tab, LucideIcon> = {
  details: SettingsIcon,
  inventory: BackpackIcon,
  features: ListIcon,
  spells: BookOpenIcon,
  effects: ZapIcon,
  biography: FeatherIcon,
  animations: ClapperboardIcon,
  token: UserRoundCogIcon,
};

/** Where things dropped on a tab (or its icon) go. */
const AREA: Partial<Record<Tab, SheetArea>> = { inventory: 'inventory', spells: 'spells', features: 'features' };

const tabLabel = (tab: Tab) => t(`sheet.tab.${tab}` as MessageKey);

/** The sheet over the map, of what the session has open. */
export function CharacterSheet({
  session,
  onPopOut,
}: Readonly<{ session: Session; onPopOut: (target: SheetTarget & { edit: boolean }) => void }>) {
  const target = session.sheets.current;
  const live = target && liveOf(session, target);
  if (!target || !live) return null;
  const controls: SheetControls = {
    setEdit: (edit) => session.sheets.setEdit(edit),
    close: () => session.sheets.open(undefined),
    popOut: () => {
      onPopOut(target);
      session.sheets.open(undefined);
    },
  };
  return (
    <SheetWindow
      key={`${target.kind}:${target.id}`}
      session={session}
      target={target}
      live={live}
      controls={controls}
    />
  );
}

const liveOf = (session: Session, t: SheetTarget): Draft | undefined =>
  t.kind === 'token' ? session.tokens.get(t.id) : session.actors.get(t.id);

/** A sheet popped out into its own window (PopOutWindow.tsx), with its own edit mode. */
export function PoppedSheet({
  session,
  target,
  controls,
}: Readonly<{ session: Session; target: SheetTarget & { edit: boolean }; controls: SheetControls }>) {
  const live = liveOf(session, target);
  if (!live) return <p className="muted p-6">{"This sheet isn't on the table any more."}</p>;
  return <SheetWindow session={session} target={target} live={live} controls={controls} />;
}

/** A sheet in its own window fills it instead of floating over the map. */
const POPPED = 'static h-auto min-h-screen w-full translate-x-0';

function SheetWindow({
  session,
  target,
  live,
  controls,
}: Readonly<{ session: Session; target: SheetTarget & { edit: boolean }; live: Draft; controls: SheetControls }>) {
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  });
  const { value, update } = useAutoSave<Draft>(live, (draft) => {
    if (target.kind === 'token') session.requests.editToken(live.id, tokenPatch(liveRef.current, draft));
    else session.requests.saveActor(draft);
  });
  const rules = editionOf(value, session.world ?? {});
  const sheet = sheetOf(session, target, live, previewSheet(value, rules));
  if (!sheet) return null;
  const props: SheetProps = { session, kind: target.kind, value, update, sheet, edit: target.edit };
  return (
    <section
      className={cn(
        'sheet frame absolute top-[5vh] left-1/2 z-5 flex h-[min(780px,88vh)] w-[min(1060px,calc(100vw-32px))] -translate-x-1/2 flex-col p-0',
        target.edit && 'ring-1 ring-gold-bright/30',
        !controls.popOut && POPPED,
      )}
      aria-label={t('sheet.label', { name: value.name })}
      {...sheetDropTarget(session)}
    >
      <SheetHeader {...props} controls={controls} />
      <AbilityRow {...props} />
      <SheetBody {...props} rules={rules} />
      {target.edit && <SheetFoot {...props} />}
    </section>
  );
}

/** The stats shown: as the server sent them, or as edited; a plain token (no stats) shows only to the GM. */
function sheetOf(
  session: Session,
  target: SheetTarget & { edit: boolean },
  live: Draft,
  preview: Creature | undefined,
): Creature | undefined {
  if (live.sheet && !target.edit) return live.sheet;
  return target.kind === 'token' && !live.sheet && !session.isGm() ? undefined : preview;
}

/** Which tabs the creature has: spells for a caster, animations for something to animate, the token in edit mode. */
function tabsOf({ sheet, edit, value }: Readonly<SheetProps>): Tab[] {
  const shown: Record<Tab, boolean> = {
    details: true,
    inventory: true,
    features: true,
    spells: edit || !!sheet.caster || !!value.stats?.spells?.length || !!value.own?.spells?.length,
    effects: true,
    biography: true,
    animations: sheet.attacks.length > 0 || !!sheet.caster?.spells.length,
    token: edit,
  };
  return TABS.filter((tab) => shown[tab]);
}

function SheetBody(props: Readonly<SheetProps & { rules: Edition }>) {
  const [tab, setTab] = useState<Tab>('inventory');
  const tabs = tabsOf(props);
  const shown = tabs.includes(tab) ? tab : 'inventory';
  return (
    <Tabs
      value={shown}
      onValueChange={(v) => setTab(v as Tab)}
      orientation="vertical"
      className="min-h-0 flex-1 flex-row gap-0"
    >
      <SheetSidebar {...props} />
      <div className="min-w-0 flex-1 overflow-y-auto px-5 py-3" data-area={AREA[shown]} role="tabpanel">
        <TabPage {...props} tab={shown} />
      </div>
      <TabsList className="h-auto w-11 shrink-0 flex-col items-stretch justify-start gap-1 border-b-0 border-l border-gold-dim/40 py-2">
        {tabs.map((tab) => (
          <TabIcon key={tab} tab={tab} onDragEnter={() => AREA[tab] && setTab(tab)} />
        ))}
      </TabsList>
    </Tabs>
  );
}

function TabIcon({ tab, onDragEnter }: Readonly<{ tab: Tab; onDragEnter: () => void }>) {
  const Icon = TAB_ICON[tab];
  return (
    <TabsTrigger
      value={tab}
      aria-label={tabLabel(tab)}
      title={tabLabel(tab)}
      data-area={AREA[tab]}
      onDragEnter={onDragEnter}
      className="mb-0 -ml-px flex-none border-b-0 border-l-2 px-0 py-2.5 data-[state=active]:border-gold data-[state=active]:bg-gold/10 [&_svg]:size-[18px]"
    >
      <Icon />
    </TabsTrigger>
  );
}

function TabPage(props: Readonly<SheetProps & { rules: Edition; tab: Tab }>) {
  switch (props.tab) {
    case 'details':
      return <DetailsTab {...props} />;
    case 'inventory':
      return <InventoryTab {...props} />;
    case 'features':
      return <FeaturesTab {...props} />;
    case 'spells':
      return <SpellsTab {...props} />;
    case 'effects':
      return <EffectsTab {...props} />;
    case 'biography':
      return <BiographyTab {...props} />;
    case 'animations':
      return <AnimationsPage {...props} />;
    case 'token':
      return <TokenTab {...props} />;
  }
}
