import type { AttackLog, ChatMessage, SpellLog } from '@vtt/system-dnd5e';
import type { DiceTerm } from '@vtt/shared';
import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../assets.ts';
import type { Session } from '../session/session.ts';
import type { ApplyHow } from '../session/session-actions.ts';
import { ActorsTab } from './ActorsTab.tsx';
import { CheckLine } from './CheckCard.tsx';
import { AssetsTab } from './AssetsTab.tsx';
import { CardsTab } from './CardsTab.tsx';
import { CompendiumTab } from './CompendiumTab.tsx';
import { JournalTab } from './JournalTab.tsx';
import { PlaylistsTab } from './PlaylistsTab.tsx';
import { TablesTab } from './TablesTab.tsx';
import { MacrosTab } from './MacrosTab.tsx';
import { PlayersTab } from './PlayersTab.tsx';
import { ScenesTab } from './ScenesTab.tsx';
import { diceArt } from '../icon-art.ts';
import { t } from '../i18n/index.ts';
import { attackLogIcon, spellLogIcon } from '../play/log-icons.ts';
import type { Icon } from '../icons.ts';
import { IconFace } from './Icon.tsx';
import { targetText } from '../text/spell-text.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import type { Tab } from './panel-tabs.ts';
import { SelectField } from './kit/select.tsx';
import { HIDDEN_ROLL, modeNote, ROLL_MODE_OPTIONS } from '../play/roll-mode.ts';
import type { RollMode } from '@vtt/shared';

const QUICK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

/** What a side panel tab shows: the log, or one of the lists. */
export function PanelPage({ tab, session }: Readonly<{ tab: Tab; session: Session }>) {
  return tab === 'Adventure log' ? <Log session={session} /> : <Library tab={tab} session={session} />;
}

/** The tabs other than the log. */
function Library({ tab, session }: Readonly<{ tab: Exclude<Tab, 'Adventure log'>; session: Session }>) {
  const Panel = {
    Journal: JournalTab,
    Tables: TablesTab,
    Macros: MacrosTab,
    Cards: CardsTab,
    Music: PlaylistsTab,
    Scenes: ScenesTab,
    Actors: ActorsTab,
    Compendium: CompendiumTab,
    Assets: AssetsTab,
    Players: PlayersTab,
  }[tab];
  return <Panel session={session} />;
}

function Log({ session }: Readonly<{ session: Session }>) {
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [session.chat.length]);

  const submit = (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    session.requests.say(text);
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
            session={session}
            onApply={(how) => session.actions.applyRoll(m.id, how)}
            onUndo={
              session.isGm() && session.edits.history.card === m.id ? () => session.edits.undoCard(m.id) : undefined
            }
          />
        ))}
      </div>
      <div className="dice">
        {QUICK_DICE.map((d) => (
          <button key={d} onClick={() => session.requests.say(`/r 1${d}`)} title={`Roll 1${d}`}>
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
          placeholder="Message or /r 1d20"
        />
        <SelectField
          className="w-[7.25rem] flex-none"
          aria-label="Who sees your rolls"
          title="Who sees your rolls and the results of your attacks and spells"
          value={session.actions.rollMode}
          onValueChange={(m) => session.actions.setRollMode(m as RollMode)}
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
  session: Session;
  /** Applies the card's roll to your targets or selection. */
  onApply: (how: ApplyHow) => void;
  /** GM, latest game action only: undoes what the card reports. */
  onUndo?: () => void;
}

/** A chat card; a roll gets buttons to apply it (in full, half, double, as healing). */
function Message({ m, session, onApply, onUndo }: Readonly<MessageProps>) {
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
      {m.check && <CheckLine m={{ ...m, check: m.check }} session={session} />}
      {m.roll && <RollLine roll={m.roll} label={m.label} />}
      {m.roll && <ApplyButtons onApply={onApply} />}
    </div>
  );
}

function RollLine({ roll, label }: Readonly<{ roll: NonNullable<ChatMessage['roll']>; label?: string }>) {
  return (
    <span className="roll">
      <span className="muted">{roll.formula}</span>
      <span className="roll-terms">
        {roll.terms.map((t, i) => (
          <Term key={i} t={t} first={i === 0} />
        ))}
      </span>
      <span className="roll-total">{roll.total}</span>
      {label && <span className="muted">{label}</span>}
    </span>
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
        <CardIcon icon={attackLogIcon(a)} />
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
/** The attack's or spell's icon at the head of its card. */
function CardIcon({ icon }: Readonly<{ icon: Icon }>) {
  return (
    <span data-slot="card-icon" className="mr-1.5 inline-block size-6 overflow-hidden rounded align-middle">
      <IconFace icon={icon} size={16} />
    </span>
  );
}

function SpellLine({ s }: Readonly<{ s: SpellLog }>) {
  return (
    <span className="attack-log spell-log">
      <span className="msg-text">
        <CardIcon icon={spellLogIcon(s)} />
        <b>{s.caster}</b> {t(s.feature ? 'chat.uses' : 'chat.casts')} <b className="spell-name">{s.spell}</b>
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
