import type { AttackLog, ChatMessage, DiceTerm, SpellLog } from '@vtt/shared';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '../session.ts';
import { ActorsTab } from './ActorsTab.tsx';
import { CompendiumTab } from './CompendiumTab.tsx';
import { PlayersTab } from './PlayersTab.tsx';
import { ScenesTab } from './ScenesTab.tsx';
import { diceArt } from '../icon-art.ts';
import { targetText } from '../spell-text.ts';

const QUICK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

/** The GM's side panel has tabs, like a VTT sidebar: the log, the scenes, the Actors list, the Compendium and the seats. */
const TABS = ['Adventure log', 'Scenes', 'Actors', 'Compendium', 'Players'] as const;
type Tab = (typeof TABS)[number];

export function ChatPanel({ session }: Readonly<{ session: Session }>) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('Adventure log');
  const gm = session.isGm();
  const shown = gm ? tab : 'Adventure log';
  return (
    <aside className={`chat frame${open ? '' : ' closed'}${shown === 'Adventure log' ? '' : ' library'}`}>
      <header className="chat-head">
        <span>{shown}</span>
        <button className="close" onClick={() => setOpen(!open)} aria-label={open ? 'Hide panel' : 'Show panel'}>
          {open ? '–' : '+'}
        </button>
      </header>
      {gm && (
        <nav className="side-tabs">
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'Adventure log' ? 'Log' : t}
            </button>
          ))}
        </nav>
      )}
      {shown === 'Adventure log' ? <Log session={session} open={open} /> : <Library tab={shown} session={session} />}
    </aside>
  );
}

/** The GM's tabs other than the log. */
function Library({ tab, session }: Readonly<{ tab: Exclude<Tab, 'Adventure log'>; session: Session }>) {
  const Panel = { Scenes: ScenesTab, Actors: ActorsTab, Compendium: CompendiumTab, Players: PlayersTab }[tab];
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
          <p className="muted">Type to chat. Roll with /r 1d20+5, or /gmr for a GM-only roll.</p>
        )}
        {session.chat.map((m) => (
          <Message
            key={m.id}
            m={m}
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
      <form onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message or /r 2d20kh1+4" />
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

/** A chat card; `onUndo` (GM, latest game action only) puts a button on it to undo what it reports. */
function Message({ m, onUndo }: Readonly<{ m: ChatMessage; onUndo?: () => void }>) {
  return (
    <div className={kindOf(m)}>
      <span className="msg-from" style={{ color: m.color }}>
        {m.from}
        {m.gmOnly && <span className="muted"> (to GM)</span>}
        {m.undone && <span className="muted"> (undone)</span>}
        {onUndo && (
          <button className="link msg-undo" onClick={onUndo} title="Undo this action (the dice are not rolled again)">
            Undo
          </button>
        )}
      </span>
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
        </span>
      )}
    </div>
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
