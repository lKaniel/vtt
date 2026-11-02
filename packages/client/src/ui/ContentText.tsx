import { DicesIcon } from 'lucide-react';
import type { CheckRef, ContentLink } from '../content/content-links.ts';
import { checkClick, linkTarget, rollClick } from '../content/content-target.ts';
import { parseRich, type Span } from '../text/rich-text.ts';
import type { Session } from '../session/session.ts';
import type { Tip } from '../text/tooltip.ts';
import { Button } from './kit/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';

// Journal text with its links and inline rolls live: an entry, sheet or
// scene link opens it, rules content shows its card, a roll rolls in chat
// and a check is rolled (or, for the GM, asked of the party).

const INLINE = 'h-auto px-0.5 align-baseline text-[length:inherit] text-gold hover:text-gold-bright';

export function ContentText({
  session,
  text,
  className,
}: Readonly<{ session: Session; text: string; className?: string }>) {
  return (
    <div className={className}>
      {parseRich(text).map((spans, i) => (
        <p key={i}>
          {spans.map((s, j) => (
            <SpanView key={j} session={session} s={s} />
          ))}
        </p>
      ))}
    </div>
  );
}

function SpanView({ session, s }: Readonly<{ session: Session; s: Span }>) {
  if (s.link) return <LinkSpan session={session} link={s.link} label={s.text} />;
  if (s.roll)
    return (
      <Button
        variant="link"
        className={INLINE}
        data-slot="inline-roll"
        title={s.roll}
        onClick={rollClick(session, s.roll)}
      >
        <DicesIcon className="size-3.5" />
        {s.text}
      </Button>
    );
  if (s.check) return <CheckSpan session={session} check={s.check} label={s.text} />;
  return <Marked s={s} />;
}

function Marked({ s }: Readonly<{ s: Span }>) {
  if (s.bold && s.italic)
    return (
      <strong>
        <em>{s.text}</em>
      </strong>
    );
  if (s.bold) return <strong>{s.text}</strong>;
  return s.italic ? <em>{s.text}</em> : <span>{s.text}</span>;
}

function LinkSpan({ session, link, label }: Readonly<{ session: Session; link: ContentLink; label: string }>) {
  const target = linkTarget(session, link);
  const text = label === '' ? (target.name ?? link.id) : label;
  if (target.tip) return <TipLink tip={target.tip} text={text} />;
  if (!target.open) return <em data-slot="content-link">{text}</em>;
  return (
    <Button variant="link" className={INLINE} data-slot="content-link" onClick={target.open}>
      {text}
    </Button>
  );
}

function TipLink({ tip, text }: Readonly<{ tip: Tip; text: string }>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="link" className={INLINE} data-slot="content-link">
          {text}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-[300px] flex-col gap-1 text-sm">
        <div className="font-display text-base text-gold-bright">{tip.title}</div>
        {tip.subtitle && <div className="text-muted-foreground">{tip.subtitle}</div>}
        {tip.facts.map((f) => (
          <div key={f}>{f}</div>
        ))}
        {tip.body && <p className="max-h-60 overflow-auto whitespace-pre-line">{tip.body}</p>}
      </PopoverContent>
    </Popover>
  );
}

function CheckSpan({ session, check, label }: Readonly<{ session: Session; check: CheckRef; label: string }>) {
  const click = checkClick(session, check);
  if (!click) return <em>{label}</em>;
  const gm = session.isGm();
  const ready = gm || session.selected !== undefined;
  return (
    <Button
      variant="link"
      className={INLINE}
      data-slot="inline-check"
      disabled={!ready}
      title={gm ? 'Ask the selected creatures, or the party, for this check' : 'Roll it for your selected creature'}
      onClick={click}
    >
      {label} check
    </Button>
  );
}
