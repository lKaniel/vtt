import type { AttackLog, ChatMessage, SpellLog } from '@vtt/system-dnd5e';
import type { DiceTerm } from '@vtt/shared';
import {
  ArmchairIcon,
  BookOpenIcon,
  DicesIcon,
  ImageIcon,
  LibraryIcon,
  MapIcon,
  MinusIcon,
  MusicIcon,
  PlusIcon,
  SquareTerminalIcon,
  ScrollTextIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../assets.ts';
import type { Session } from '../session.ts';
import type { ApplyHow } from '../session-actions.ts';
import { ActorsTab } from './ActorsTab.tsx';
import { AssetsTab } from './AssetsTab.tsx';
import { CompendiumTab } from './CompendiumTab.tsx';
import { JournalTab } from './JournalTab.tsx';
import { PlaylistsTab } from './PlaylistsTab.tsx';
import { TablesTab } from './TablesTab.tsx';
import { MacrosTab } from './MacrosTab.tsx';
import { PlayersTab } from './PlayersTab.tsx';
import { ScenesTab } from './ScenesTab.tsx';
import { diceArt } from '../icon-art.ts';
import { targetText } from '../spell-text.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Tabs, TabsList, TabsTrigger } from './kit/tabs.tsx';
import { SelectField } from './kit/select.tsx';
import { HIDDEN_ROLL, modeNote, ROLL_MODE_OPTIONS } from '../roll-mode.ts';
import type { RollMode } from '@vtt/shared';

const QUICK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

/** The side panel has tabs, like a VTT sidebar: the log, journal and macros for everyone; for the GM the scenes, Actors, Compendium, tables, music, assets and packs, and the seats; the Compendium for trusted players. */
const TABS = [
  'Adventure log',
  'Journal',
  'Scenes',
  'Actors',
  'Compendium',
  'Tables',
  'Macros',
  'Music',
  'Assets',
  'Players',
] as const;
type Tab = (typeof TABS)[number];
const PLAYER_TABS: readonly Tab[] = ['Adventure log', 'Journal', 'Macros'];

/** Each tab is an icon in one slim row; its name is the panel's title and the icon's tooltip. */
const TAB_ICONS: Record<Tab, LucideIcon> = {
  'Adventure log': ScrollTextIcon,
  Journal: BookOpenIcon,
  Scenes: MapIcon,
  Actors: UsersIcon,
  Compendium: LibraryIcon,
  Tables: DicesIcon,
  Macros: SquareTerminalIcon,
  Music: MusicIcon,
  Assets: ImageIcon,
  Players: ArmchairIcon,
};

/** Players who may edit a creature (trusted owners) also get the Compendium, to fill their sheets from. */
const playerTabs = (session: Session): readonly Tab[] =>
  [...session.tokens.keys()].some((id) => session.canEdit(id)) ? [...PLAYER_TABS, 'Compendium'] : PLAYER_TABS;

export function ChatPanel({ session }: Readonly<{ session: Session }>) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('Adventure log');
  const tabs = session.isGm() ? TABS : playerTabs(session);
  const shown = tabs.includes(tab) ? tab : 'Adventure log';
  return (
    <aside className={`chat frame${open ? '' : ' closed'}${shown === 'Adventure log' ? '' : ' library'}`}>
      <header className="chat-head">
        <span>{shown}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Hide panel' : 'Show panel'}
          title={open ? 'Hide panel' : 'Show panel'}
        >
          {open ? <MinusIcon /> : <PlusIcon />}
        </Button>
      </header>
      <Tabs value={shown} onValueChange={(t) => setTab(t as Tab)}>
        <TabsList className="mb-1.5">
          {tabs.map((t) => {
            const Icon = TAB_ICONS[t];
            return (
              <TabsTrigger key={t} value={t} title={t} aria-label={t} className="px-1 pt-0.5 pb-1.5 [&_svg]:size-4">
                <Icon />
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      {shown === 'Adventure log' ? <Log session={session} open={open} /> : <Library tab={shown} session={session} />}
    </aside>
  );
}

/** The tabs other than the log. */
function Library({ tab, session }: Readonly<{ tab: Exclude<Tab, 'Adventure log'>; session: Session }>) {
  const Panel = {
    Journal: JournalTab,
    Tables: TablesTab,
    Macros: MacrosTab,
    Music: PlaylistsTab,
    Scenes: ScenesTab,
    Actors: ActorsTab,
    Compendium: CompendiumTab,
    Assets: AssetsTab,
    Players: PlayersTab,
  }[tab];
  return <Panel session={session} />;
}

function Log({ session, open }: Readonly<{ session: Session; open: boolean }>) {
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [session.chat.length, open]);

  const submit = (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    session.say(text);
    setText('');
  };

  return (
    <>
      <div className="chat-list" ref={list}>
        {session.chat.length === 0 && (
          <p className="muted">
            Type to chat. Roll with /r 1d20+5; /gmr, /br and /sr roll once for the GM, blind or for yourself.
          </p>
        )}
        {session.chat.map((m) => (
          <Message
            key={m.id}
            m={m}
            onApply={(how) => session.applyRoll(m.id, how)}
            onUndo={session.isGm() && session.history.card === m.id ? () => session.undoCard(m.id) : undefined}
          />
        ))}
      </div>
      <div className="dice">
        {QUICK_DICE.map((d) => (
          <button key={d} onClick={() => session.say(`/r 1${d}`)} title={`Roll 1${d}`}>
            <img src={diceArt(d)} alt="" draggable={false} />
            <span>{d}</span>
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-1.5">
        <Input
          className="min-w-0 flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message or /r 2d20kh1+4"
        />
        <SelectField
          className="w-[7.25rem] flex-none"
          aria-label="Who sees your rolls"
          title="Who sees your rolls and the results of your attacks and spells"
          value={session.rollMode}
          onValueChange={(m) => session.setRollMode(m as RollMode)}
          options={ROLL_MODE_OPTIONS}
        />
      </form>
    </>
  );
}

function kindOf(m: ChatMessage): string {
  const undone = m.undone ? ' msg-undone' : '';
  if (m.attack) return `msg msg-attack${undone}`;
  if (m.spell) return `msg msg-spell${undone}`;
  return (m.roll ? 'msg msg-roll' : 'msg') + undone;
}

interface MessageProps {
  m: ChatMessage;
  /** Applies the card's roll to your targets or selection. */
  onApply: (how: ApplyHow) => void;
  /** GM, latest game action only: undoes what the card reports. */
  onUndo?: () => void;
}

/** A chat card; a roll gets buttons to apply it (in full, half, double, as healing). */
function Message({ m, onApply, onUndo }: Readonly<MessageProps>) {
  return (
    <div className={kindOf(m)}>
      <span className="msg-from" style={{ color: m.color }}>
        {m.avatar && (
          <img
            src={assetUrl(m.avatar)}
            alt=""
            data-slot="chat-avatar"
            className="mr-1.5 inline-block size-5 rounded-full border border-gold-dim object-cover align-middle"
          />
        )}
        {m.from}
        {modeNote(m) && <span className="muted"> ({modeNote(m)})</span>}
        {m.undone && <span className="muted"> (undone)</span>}
        {onUndo && (
          <Button
            variant="link"
            className="msg-undo"
            onClick={onUndo}
            title="Undo this action (the dice are not rolled again)"
          >
            Undo
          </Button>
        )}
      </span>
      {m.hidden && <span className="msg-text muted">{HIDDEN_ROLL}</span>}
      {m.text && <span className="msg-text">{m.text}</span>}
      {m.attack && <AttackLine a={m.attack} />}
      {m.spell && <SpellLine s={m.spell} />}
      {m.roll && (
        <span className="roll">
          <span className="muted">{m.roll.formula}</span>
          <span className="roll-terms">
            {m.roll.terms.map((t, i) => (
              <Term key={i} t={t} first={i === 0} />
            ))}
          </span>
          <span className="roll-total">{m.roll.total}</span>
          {m.label && <span className="muted">{m.label}</span>}
        </span>
      )}
      {m.roll && <ApplyButtons onApply={onApply} />}
    </div>
  );
}

const APPLY: { how: ApplyHow; label: string; title: string }[] = [
  { how: 'full', label: 'Apply', title: 'Deal it to your targets, or the selected creatures' },
  { how: 'half', label: '½', title: 'Deal half (a save for half)' },
  { how: 'double', label: '×2', title: 'Deal double' },
  { how: 'heal', label: 'Heal', title: 'Heal them by it' },
];

function ApplyButtons({ onApply }: Readonly<{ onApply: (how: ApplyHow) => void }>) {
  return (
    <span className="mt-1 flex gap-1" data-slot="apply-roll">
      {APPLY.map((a) => (
        <Button
          key={a.how}
          variant="outline"
          size="sm"
          className="h-6 px-2"
          title={a.title}
          onClick={() => onApply(a.how)}
        >
          {a.label}
        </Button>
      ))}
    </span>
  );
}

function verdict(a: AttackLog): { cls: string; text: string } {
  if (a.crit) return { cls: 'crit', text: 'Critical hit!' };
  return a.hit ? { cls: 'hit', text: 'Hit' } : { cls: 'miss', text: 'Miss' };
}

/** "Hero → Goblin, Longsword: [14] + 5 = 19. Hit: 7 slashing." */
function AttackLine({ a }: Readonly<{ a: AttackLog }>) {
  const v = verdict(a);
  return (
    <span className="attack-log">
      <span className="msg-text">
        {a.attacker} → {a.target}, {a.attack}
      </span>
      <span className="roll">
        <span className="roll-terms">
          {a.d20.terms.map((t, i) => (
            <Term key={i} t={t} first={i === 0} />
          ))}
        </span>
        <span className="roll-total">{a.d20.total}</span>
        <span className={v.cls}>{v.text}</span>
      </span>
      {a.hit && (
        <span className="msg-text damage">
          {a.parts.map((p) => `${p.dealt} ${p.type}`).join(' + ')} damage
          {a.parts.some((p) => p.dealt !== p.roll.total) && <span className="muted"> (adjusted)</span>}
        </span>
      )}
      {a.notes.map((n) => (
        <span key={n} className="muted">
          {n}
        </span>
      ))}
    </span>
  );
}

/** "Wiz casts Fireball (3rd level)", then a line per target. */
function SpellLine({ s }: Readonly<{ s: SpellLog }>) {
  return (
    <span className="attack-log spell-log">
      <span className="msg-text">
        <b>{s.caster}</b> casts <b className="spell-name">{s.spell}</b>
        {s.slot > 0 && <span className="muted"> (level {s.slot} slot)</span>}
      </span>
      {s.results.map((r, i) => (
        <span key={i} className="msg-text">
          {targetText(r)}
        </span>
      ))}
      {s.notes.map((n) => (
        <span key={n} className="muted">
          {n}
        </span>
      ))}
    </span>
  );
}

function signText(t: DiceTerm, first: boolean): string {
  if (t.sign < 0) return ' − ';
  return first ? '' : ' + ';
}

function Term({ t, first }: Readonly<{ t: DiceTerm; first: boolean }>) {
  const sign = signText(t, first);
  if (t.rolls.length === 0) return <>{`${sign}${t.value}`}</>;
  return (
    <>
      {sign}[
      {t.rolls.map((r, i) => (
        <span key={i} className={t.kept[i] ? '' : 'dropped'}>
          {i > 0 ? ', ' : ''}
          {r}
        </span>
      ))}
      ]
    </>
  );
}
