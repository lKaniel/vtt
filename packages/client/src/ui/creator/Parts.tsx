import type { ReactNode } from 'react';
import { parseRich } from '../../rich-text.ts';

// Building blocks shared by the creator's steps.

export function RichText({ text, className = 'rich' }: Readonly<{ text: string; className?: string }>) {
  return (
    <div className={className}>
      {parseRich(text).map((spans, i) => (
        <p key={i}>
          {spans.map((s, j) => {
            if (s.bold && s.italic)
              return (
                <strong key={j}>
                  <em>{s.text}</em>
                </strong>
              );
            if (s.bold) return <strong key={j}>{s.text}</strong>;
            return s.italic ? <em key={j}>{s.text}</em> : <span key={j}>{s.text}</span>;
          })}
        </p>
      ))}
    </div>
  );
}

/** A selectable card in an option grid. */
export function OptionCard({
  title,
  sub,
  on,
  onClick,
  children,
}: Readonly<{ title: string; sub?: string; on: boolean; onClick: () => void; children?: ReactNode }>) {
  return (
    <button className={on ? 'cc-card on' : 'cc-card'} onClick={onClick} aria-pressed={on}>
      <span className="cc-card-title">{title}</span>
      {sub && <span className="cc-card-sub">{sub}</span>}
      {children}
    </button>
  );
}

/** A row of small toggle chips. */
export function Chips<T extends string>({
  options,
  value,
  onPick,
}: Readonly<{ options: { id: T; label: string }[]; value: T | undefined; onPick: (id: T) => void }>) {
  return (
    <div className="cc-chips">
      {options.map((o) => (
        <button key={o.id} className={o.id === value ? 'chip on' : 'chip'} onClick={() => onPick(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The step's title and a line on what to do. */
export function StepHead({ title, hint, right }: Readonly<{ title: string; hint: string; right?: ReactNode }>) {
  return (
    <div className="cc-step-head">
      <div>
        <h2>{title}</h2>
        <p className="cc-hint">{hint}</p>
      </div>
      {right}
    </div>
  );
}

/** A titled block in the detail column. */
export function Detail({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="cc-detail">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function TraitList({ traits }: Readonly<{ traits: { name: string; description: string }[] }>) {
  if (!traits.length) return null;
  return (
    <dl className="cc-traits">
      {traits.map((t) => (
        <div key={t.name}>
          <dt>{t.name}</dt>
          <dd>
            <RichText text={t.description} className="rich small" />
          </dd>
        </div>
      ))}
    </dl>
  );
}
