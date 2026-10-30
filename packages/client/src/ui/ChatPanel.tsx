import type { AttackLog, ChatMessage, DiceTerm, SpellLog } from '@vtt/shared';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '../session.ts';
import { targetText } from '../spell-text.ts';

const QUICK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

export function ChatPanel({ session }: Readonly<{ session: Session }>) {
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [session.chat.length]);

  const submit = (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    session.say(text);
    setText('');
  };

  return (
    <aside className="chat">
      <div className="chat-list" ref={list}>
        {session.chat.length === 0 && (
          <p className="muted">Type to chat. Roll with /r 1d20+5, or /gmr for a GM-only roll.</p>
        )}
        {session.chat.map((m) => (
          <Message key={m.id} m={m} />
        ))}
      </div>
      <div className="dice">
        {QUICK_DICE.map((d) => (
          <button key={d} onClick={() => session.say(`/r 1${d}`)}>
            {d}
          </button>
        ))}
      </div>
      <form onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message or /r 2d20kh1+4" />
      </form>
    </aside>
  );
}

function Message({ m }: Readonly<{ m: ChatMessage }>) {
  return (
    <div className="msg">
      <span className="msg-from" style={{ color: m.color }}>
        {m.from}
        {m.gmOnly && <span className="muted"> (to GM)</span>}
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
        <span className="msg-text">
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
        {s.caster} casts {s.spell}
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
