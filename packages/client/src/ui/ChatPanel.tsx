import type { ChatMessage, DiceTerm } from '@vtt/shared';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '../session.ts';

const QUICK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

export function ChatPanel({ session }: { session: Session }) {
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [session.chat.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    session.say(text);
    setText('');
  };

  return (
    <aside className="chat">
      <div className="chat-list" ref={list}>
        {session.chat.length === 0 && <p className="muted">Type to chat. Roll with /r 1d20+5, or /gmr for a GM-only roll.</p>}
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

function Message({ m }: { m: ChatMessage }) {
  return (
    <div className="msg">
      <span className="msg-from" style={{ color: m.color }}>
        {m.from}
        {m.gmOnly && <span className="muted"> (to GM)</span>}
      </span>
      {m.text && <span className="msg-text">{m.text}</span>}
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

function Term({ t, first }: { t: DiceTerm; first: boolean }) {
  const sign = t.sign < 0 ? ' − ' : first ? '' : ' + ';
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
