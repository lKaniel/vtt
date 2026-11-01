import { useEffect, useState } from 'react';
import { type Calendar, dateOf, secondsOf } from '@vtt/shared';
import type { Session } from '../session.ts';
import { parseMonths, quickSkips, shortDate, turnMode } from '../session-time.ts';

/** The game's date and time in the top bar; the GM's clock controls open from it. */
export function ClockBar({ session }: Readonly<{ session: Session }>) {
  const clock = session.clock();
  const mode = turnMode(session.combat);
  const ticking = clock.since !== undefined && mode === 'free';
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  const gm = session.isGm();
  const { state, title } = clockLook(mode, ticking);
  return (
    <span className={`clock-bar clock-${state}`}>
      <button
        className="link clock-date"
        title={`${session.dateText()}. ${title}`}
        disabled={!gm}
        onClick={() => setOpen(!open)}
      >
        <span className="clock-dot" aria-hidden /> {shortDate(clock.calendar, session.gameTime())}
      </button>
      {gm && open && <ClockPanel session={session} onClose={() => setOpen(false)} />}
    </span>
  );
}

const LOOKS = {
  running: 'Time runs',
  stopped: 'Time stands still',
  turns: 'Turn-based: 6 seconds a round',
};

/** How the clock shows: running, standing still, or counting rounds. */
function clockLook(mode: ReturnType<typeof turnMode>, ticking: boolean): { state: keyof typeof LOOKS; title: string } {
  let state: keyof typeof LOOKS = 'turns';
  if (mode === 'free') state = ticking ? 'running' : 'stopped';
  return { state, title: LOOKS[state] };
}

/** GM: run, stop and skip the clock, set the date, the speed and the calendar. */
function ClockPanel({ session, onClose }: Readonly<{ session: Session; onClose: () => void }>) {
  const clock = session.clock();
  const running = clock.running === true;
  return (
    <div className="clock-panel frame" role="dialog" aria-label="World time">
      <div className="clock-row">
        <button
          className="btn small"
          onClick={() => session.clockAction({ do: running ? 'stop' : 'start' })}
          title={running ? 'Stop the clock' : 'Let time run (it holds still in fights and turn-based mode)'}
        >
          {running ? 'Stop time' : 'Start time'}
        </button>
        <TurnBasedButton session={session} />
        <button className="link" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="clock-row">
        {quickSkips.map((s) => (
          <button
            key={s.label}
            className="btn small"
            onClick={() => session.clockAction({ do: 'skip', seconds: s.seconds })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <DateForm key={clock.time} session={session} />
      <label className="clock-row">
        Speed
        <select
          value={clock.speed}
          onChange={(e) => session.clockAction({ do: 'speed', speed: Number(e.target.value) })}
        >
          {[1, 2, 10, 60, 600].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? 'Real time' : `${n}×`}
            </option>
          ))}
        </select>
      </label>
      <CalendarForm session={session} />
    </div>
  );
}

function TurnBasedButton({ session }: Readonly<{ session: Session }>) {
  const mode = turnMode(session.combat);
  if (mode === 'fight') return <span className="muted">Fight: turn-based</span>;
  const on = mode === 'turns';
  return (
    <button
      className={`btn small${on ? ' active' : ''}`}
      title="The party takes turns, 6 seconds a round, as in a fight"
      onClick={() => session.setTurnBased(!on)}
    >
      {on ? 'Real time' : 'Turn-based'}
    </button>
  );
}

/** Sets the date and time. */
function DateForm({ session }: Readonly<{ session: Session }>) {
  const { calendar } = session.clock();
  const now = dateOf(calendar, session.gameTime());
  const [date, setDate] = useState(now);
  const num = (key: keyof typeof date) => (e: { target: { value: string } }) =>
    setDate({ ...date, [key]: Number(e.target.value) });
  return (
    <form
      className="clock-row clock-date-form"
      onSubmit={(e) => {
        e.preventDefault();
        session.clockAction({ do: 'set', time: secondsOf(calendar, date) });
      }}
    >
      <input type="number" aria-label="Day" min={1} value={date.day} onChange={num('day')} />
      <select aria-label="Month" value={date.month} onChange={num('month')}>
        {calendar.months.map((m, i) => (
          <option key={m.name} value={i}>
            {m.name}
          </option>
        ))}
      </select>
      <input type="number" aria-label="Year" value={date.year} onChange={num('year')} />
      <input type="number" aria-label="Hour" min={0} max={23} value={date.hour} onChange={num('hour')} />
      <input type="number" aria-label="Minute" min={0} max={59} value={date.minute} onChange={num('minute')} />
      <button className="btn small">Set date</button>
    </form>
  );
}

/** Months as "Name days" lines, weekdays comma separated, the year, era and the sun's hours. */
function CalendarForm({ session }: Readonly<{ session: Session }>) {
  const { calendar } = session.clock();
  const [months, setMonths] = useState(calendar.months.map((m) => `${m.name} ${m.days}`).join('\n'));
  const [weekdays, setWeekdays] = useState(calendar.weekdays.join(', '));
  const [rest, setRest] = useState(calendar);
  const field = (key: keyof Calendar) => (e: { target: { value: string } }) =>
    setRest({ ...rest, [key]: key === 'era' || key === 'name' ? e.target.value : Number(e.target.value) });
  const save = () => {
    const parsed = parseMonths(months);
    const days = weekdays
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    const { epochYear, era, sunrise, sunset, twilight, night } = rest;
    const changes = { epochYear, sunrise, sunset, twilight, night, ...(era ? { era } : {}) };
    session.clockAction({
      do: 'calendar',
      calendar: {
        ...changes,
        ...(parsed.length ? { months: parsed } : {}),
        ...(days.length ? { weekdays: days } : {}),
      },
    });
  };
  return (
    <details className="clock-calendar">
      <summary>Calendar</summary>
      <label>
        Months, one per line: name and days
        <textarea rows={5} value={months} onChange={(e) => setMonths(e.target.value)} />
      </label>
      <label>
        Weekdays
        <input value={weekdays} onChange={(e) => setWeekdays(e.target.value)} />
      </label>
      <div className="clock-row">
        <label>
          First year <input type="number" value={rest.epochYear} onChange={field('epochYear')} />
        </label>
        <label>
          Era <input value={rest.era ?? ''} onChange={field('era')} />
        </label>
      </div>
      <div className="clock-row">
        <label>
          Sunrise <input type="number" min={0} max={24} value={rest.sunrise} onChange={field('sunrise')} />
        </label>
        <label>
          Sunset <input type="number" min={0} max={24} value={rest.sunset} onChange={field('sunset')} />
        </label>
        <label>
          Night <input type="number" min={0} max={1} step={0.1} value={rest.night} onChange={field('night')} />
        </label>
      </div>
      <button className="btn small" onClick={save}>
        Save calendar
      </button>
    </details>
  );
}
