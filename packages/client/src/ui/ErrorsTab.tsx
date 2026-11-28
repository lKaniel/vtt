import type { ErrorEntry } from '@vtt/shared';
import { CheckIcon, CopyIcon, Trash2Icon } from 'lucide-react';
import { useEffect } from 'react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { useCopy } from './use-copy.ts';

/**
 * GM: what went wrong in the players' browsers and on the server, newest
 * first (session-errors.ts). Copy puts it all on the clipboard, to paste
 * into a bug report or a chat with Claude.
 */
export function ErrorsTab({ session }: Readonly<{ session: Session }>) {
  const errors = session.errors;
  const latest = errors.entries.at(-1)?.last;
  useEffect(() => errors.seen(), [errors, latest]);
  const [copied, copy] = useCopy();
  if (!errors.entries.length) return <p className="muted">{t('errors.none')}</p>;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-slot="errors-tab">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => copy(errors.text())}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {t(copied ? 'errors.copied' : 'errors.copy')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => errors.clear()}>
          <Trash2Icon />
          {t('errors.clear')}
        </Button>
      </div>
      <ul className="rows min-h-0 flex-1 overflow-y-auto" aria-label={t('panel.Errors')}>
        {[...errors.entries].reverse().map((e) => (
          <ErrorRow key={e.id} entry={e} />
        ))}
      </ul>
    </div>
  );
}

function ErrorRow({ entry }: Readonly<{ entry: ErrorEntry }>) {
  const who = [entry.player, entry.browser].filter(Boolean).join(' · ');
  return (
    <li className="row flex-col items-stretch gap-1 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant={entry.source === 'server' ? 'warn' : 'muted'}>{t(`errors.${entry.source}`)}</Badge>
        {entry.count > 1 && <Badge variant="muted">×{entry.count}</Badge>}
        <time dateTime={new Date(entry.last).toISOString()}>{whenOf(entry.last)}</time>
        {who && <span>{who}</span>}
      </div>
      <div className="font-mono text-xs break-words">{entry.message}</div>
      {entry.where && <div className="text-xs text-muted-foreground">{entry.where}</div>}
      {entry.stack && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">{t('errors.stack')}</summary>
          <pre className="mt-1 max-h-48 overflow-auto font-mono text-[11px] whitespace-pre-wrap">{entry.stack}</pre>
        </details>
      )}
    </li>
  );
}

/** The time of day for today's errors, else the date and time. */
function whenOf(ms: number): string {
  const at = new Date(ms);
  const today = at.toDateString() === new Date().toDateString();
  return today
    ? at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : at.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
