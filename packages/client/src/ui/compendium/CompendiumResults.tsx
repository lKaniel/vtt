import type { Entry } from '../../compendium.ts';
import { t } from '../../i18n/index.ts';
import type { Session } from '../../session.ts';
import { startDrag } from '../ActorsTab.tsx';
import { IconFace } from '../Icon.tsx';
import { Badge } from '../kit/badge.tsx';
import { EntryDetail } from './EntryDetail.tsx';

// The Compendium's results, as rows (picture, name, the line under it, its
// pack) or as a grid of pictures. Every entry drags onto the map or a sheet;
// a click opens it.

interface ResultsProps {
  session: Session;
  list: readonly Entry[];
  open: string | undefined;
  onOpen: (key: string | undefined) => void;
}

export function ResultRows({ session, list, open, onOpen }: Readonly<ResultsProps>) {
  return (
    <ul className="lib-list">
      {list.map((e) => (
        <li
          key={e.key}
          className={open === e.key ? 'lib-row lib-entry on' : 'lib-row lib-entry'}
          draggable
          onDragStart={(ev) => startDrag(ev, e.drag)}
        >
          <button
            className="lib-main"
            onClick={() => onOpen(open === e.key ? undefined : e.key)}
            title={t('compendium.dragTitle')}
          >
            <span className="size-8 flex-none overflow-hidden rounded-[4px] border border-gold-dim/60">
              <IconFace icon={e.icon} size={18} />
            </span>
            <span className="lib-text flex-1">
              <span className="lib-name">{e.name}</span>
              <span className="lib-sub">{e.sub}</span>
            </span>
            {e.source !== 'SRD' && (
              <Badge variant="muted" className="max-w-24 truncate">
                {e.source}
              </Badge>
            )}
          </button>
          {open === e.key && <EntryDetail session={session} entry={e} />}
        </li>
      ))}
    </ul>
  );
}

export function ResultGrid({ list, open, onOpen }: Readonly<Omit<ResultsProps, 'session'>>) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-1.5 p-0">
      {list.map((e) => (
        <li key={e.key} draggable onDragStart={(ev) => startDrag(ev, e.drag)} className="cursor-grab">
          <button
            className={`flex w-full cursor-inherit flex-col items-center gap-1 rounded-[4px] border bg-transparent p-1 text-center hover:border-gold hover:bg-gold/10 ${open === e.key ? 'border-gold bg-gold/15' : 'border-transparent'}`}
            onClick={() => onOpen(open === e.key ? undefined : e.key)}
            title={[e.name, e.sub, e.source === 'SRD' ? '' : e.source].filter(Boolean).join('\n')}
            aria-label={e.name}
          >
            <span className="aspect-square w-full overflow-hidden rounded-[4px] border border-gold-dim/60">
              <IconFace icon={e.icon} size={28} />
            </span>
            <span className="line-clamp-2 w-full text-[11px] leading-tight text-foreground">{e.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
