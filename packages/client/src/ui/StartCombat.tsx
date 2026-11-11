import { isParty } from '@vtt/shared';
import { EyeOffIcon, HourglassIcon, PlusIcon, SwordsIcon, UsersIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { refOf } from '../editor/selection.ts';
import { t } from '../i18n/index.ts';
import { fightCandidates, firstPicks, notFighting, turnPicks, type FightCandidate } from '../play/fight-pick.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { Checkbox } from './kit/checkbox.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { Toggle } from './kit/toggle.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

// The GM's Start combat: a list of the creatures on the scene to tick (the
// selected ones, else those on screen, to begin with), then roll initiative.
// Turn-based mode and adding creatures to a fight under way use the same list.

const SHARED_KEY = 'vtt.sharedTurns';

/** The GM's choice of shared party turns, kept in this browser (off unless turned on: turns go by initiative). */
function loadShared(): boolean {
  try {
    return localStorage.getItem(SHARED_KEY) === 'on';
  } catch {
    return false;
  }
}

function saveShared(on: boolean): void {
  try {
    localStorage.setItem(SHARED_KEY, on ? 'on' : 'off');
  } catch {
    // Private windows may refuse storage; the choice lasts until reload.
  }
}

/** Start combat (opens the picker) and the shared party turns switch beside it. */
export function StartCombat({ session }: Readonly<{ session: Session }>) {
  const [shared, setShared] = useState(loadShared);
  const [open, setOpen] = useState(false);
  return (
    <span className="flex">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button title={t('fight.startHint')}>
            <SwordsIcon /> {t('fight.start')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-[300px] flex-col gap-2" data-slot="fight-picker">
          {open && <FightPicker session={session} shared={shared} onDone={() => setOpen(false)} />}
        </PopoverContent>
      </Popover>
      <Toggle
        variant="plate"
        className="-ml-px w-8 px-0"
        pressed={shared}
        onPressedChange={(on) => {
          setShared(on);
          saveShared(on);
        }}
        title={t('fight.sharedHint')}
        aria-label={t('fight.shared')}
      >
        <UsersIcon />
      </Toggle>
    </span>
  );
}

/** The token ids in the GM's selection. */
function selectedTokens(session: Session): string[] {
  const coll = session.editor.modeColl('tokens');
  return session.editor.selection.map(refOf).flatMap((r) => (r.coll === coll ? [r.id] : []));
}

type PickerProps = Readonly<{ session: Session; shared: boolean; onDone: () => void }>;

type Caught = 'none' | 'party' | 'foes';

/** Which side is caught off guard. */
function SurprisePick({ value, onChange }: Readonly<{ value: Caught; onChange: (v: Caught) => void }>) {
  return (
    <div className="flex items-center gap-2" title={t('fight.surprisedHint')}>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('fight.surprised')}</span>
      <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v as Caught)}>
        <ToggleGroupItem value="none">{t('fight.surpriseNone')}</ToggleGroupItem>
        <ToggleGroupItem value="party">{t('fight.party')}</ToggleGroupItem>
        <ToggleGroupItem value="foes">{t('fight.foes')}</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

/** The ids on the side caught off guard. */
function caughtIds(candidates: readonly FightCandidate[], ids: readonly string[], caught: Caught): string[] {
  if (caught === 'none') return [];
  const party = caught === 'party';
  return candidates.filter((c) => ids.includes(c.id) && c.party === party).map((c) => c.id);
}

/** The picker for a fight: initiative for those ticked. */
function FightPicker({ session, shared, onDone }: PickerProps) {
  const [candidates] = useState(() => fightCandidates(session.tokens.values(), isParty));
  const [caught, setCaught] = useState<Caught>('none');
  return (
    <Picker
      extra={<SurprisePick value={caught} onChange={setCaught} />}
      session={session}
      candidates={candidates}
      title={t('fight.who')}
      first={() => firstPicks(candidates, selectedTokens(session), session.editor.fightersInView())}
      action={(n) => (
        <>
          <SwordsIcon /> {t('fight.roll', { n })}
        </>
      )}
      onPick={(ids) => {
        session.requests.startCombat(ids, shared, caughtIds(candidates, ids, caught));
        onDone();
      }}
    />
  );
}

/** Turn-based mode outside a fight: the party and the selected creatures to begin with. */
export function StartTurns({ session }: Readonly<{ session: Session }>) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title={t('fight.turnBasedHint')}>
          <HourglassIcon /> {t('fight.turnBased')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[300px] flex-col gap-2" data-slot="turns-picker">
        {open && <TurnsPicker session={session} onDone={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  );
}

function TurnsPicker({ session, onDone }: Readonly<{ session: Session; onDone: () => void }>) {
  const [candidates] = useState(() => fightCandidates(session.tokens.values(), isParty));
  return (
    <Picker
      session={session}
      candidates={candidates}
      title={t('fight.whoTurns')}
      first={() => turnPicks(candidates, selectedTokens(session))}
      action={(n) => (
        <>
          <HourglassIcon /> {t('fight.takeTurns', { n })}
        </>
      )}
      onPick={(ids) => {
        session.requests.setTurnBased(true, ids, loadShared());
        onDone();
      }}
    />
  );
}

/** GM, in a fight or turn-based mode: more creatures join, each rolling initiative. */
export function AddFighters({ session }: Readonly<{ session: Session }>) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title={t('fight.addHint')}>
          <PlusIcon /> {t('fight.add')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[300px] flex-col gap-2" data-slot="add-fighters">
        {open && <AddPicker session={session} onDone={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  );
}

function AddPicker({ session, onDone }: Readonly<{ session: Session; onDone: () => void }>) {
  const combat = session.combat;
  const [candidates] = useState(() =>
    combat ? notFighting(fightCandidates(session.tokens.values(), isParty), combat) : [],
  );
  return (
    <Picker
      session={session}
      candidates={candidates}
      title={t('fight.whoJoins')}
      first={() => candidates.filter((c) => selectedTokens(session).includes(c.id)).map((c) => c.id)}
      action={(n) => (
        <>
          <PlusIcon /> {t('fight.join', { n })}
        </>
      )}
      onPick={(ids) => {
        for (const id of ids) session.hud.setCombatant(id, true);
        onDone();
      }}
    />
  );
}

type ListProps = Readonly<{
  session: Session;
  candidates: readonly FightCandidate[];
  title: string;
  /** Who is ticked when it opens. */
  first: () => string[];
  action: (n: number) => ReactNode;
  onPick: (ids: string[]) => void;
  /** More choices above the button. */
  extra?: ReactNode;
}>;

/** A tick box per creature on the scene, the party and the others apart, and the button that acts on those ticked. */
function Picker({ session, candidates, title, first, action, onPick, extra }: ListProps) {
  const onScreen = () => session.editor.fightersInView();
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(first()));
  const toggle = (id: string, on: boolean) =>
    setPicked((was) => (on ? new Set([...was, id]) : new Set([...was].filter((x) => x !== id))));
  if (!candidates.length) return <p className="text-xs text-muted-foreground">{t('fight.noFighters')}</p>;
  return (
    <>
      <span className="font-display text-sm text-gold">{title}</span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" onClick={() => setPicked(new Set(candidates.map((c) => c.id)))}>
          {t('fight.all')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPicked(new Set())}>
          {t('fight.none')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPicked(new Set(firstPicks(candidates, [], onScreen())))}>
          {t('fight.inView')}
        </Button>
      </div>
      <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
        <Side title={t('fight.party')} list={candidates.filter((c) => c.party)} picked={picked} onToggle={toggle} />
        <Side title={t('fight.foes')} list={candidates.filter((c) => !c.party)} picked={picked} onToggle={toggle} />
      </div>
      {extra}
      <Button
        disabled={!picked.size}
        onClick={() => onPick(candidates.filter((c) => picked.has(c.id)).map((c) => c.id))}
      >
        {action(picked.size)}
      </Button>
    </>
  );
}

type SideProps = Readonly<{
  title: string;
  list: readonly FightCandidate[];
  picked: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
}>;

/** One side of the fight: a tick box per creature. */
function Side({ title, list, picked, onToggle }: SideProps) {
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{title}</span>
      {list.map((c) => (
        <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={picked.has(c.id)} onCheckedChange={(on) => onToggle(c.id, on === true)} />
          <span className="truncate">{c.name}</span>
          {c.hidden && (
            <span className="ml-auto text-muted-foreground" title={t('fight.hidden')}>
              <EyeOffIcon className="size-3.5" aria-label={t('fight.hidden')} />
            </span>
          )}
        </label>
      ))}
    </div>
  );
}
