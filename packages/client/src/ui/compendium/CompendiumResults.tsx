import type { Entry } from '../../content/compendium.ts';
import { t } from '../../i18n/index.ts';
import type { Session } from '../../session/session.ts';
import { startDrag } from '../ActorsTab.tsx';
import { IconFace } from '../Icon.tsx';
import { Badge } from '../kit/badge.tsx';
import { EntryDetail } from './EntryDetail.tsx';
import { EntryRow, EntryTile, TileGrid } from '../directory/parts.tsx';

// The Compendium's results, as rows (picture, name, the line under it, its
// pack) or as a grid of pictures. Every entry drags onto the map or a sheet;
// a click opens it.

interface ResultsProps {
  session: Session;
  list: readonly Entry[];
  open: string | undefined;
  onOpen: (key: string | undefined) => void;
}

const picture = (e: Entry, size: number) => <IconFace icon={e.icon} size={size} />;

export function ResultRows({ session, list, open, onOpen }: Readonly<ResultsProps>) {
  return (
    <ul className="lib-list">
      {list.map((e) => (
        <EntryRow
          key={e.key}
          look={{
            picture: picture(e, 18),
            name: e.name,
            sub: e.sub,
            on: open === e.key,
            badge: e.source !== 'SRD' && (
              <Badge variant="muted" className="max-w-24 truncate">
                {e.source}
              </Badge>
            ),
          }}
          events={{
            draggable: true,
            onDragStart: (ev) => startDrag(ev, e.drag),
            onClick: () => onOpen(open === e.key ? undefined : e.key),
            title: t('compendium.dragTitle'),
          }}
        >
          {open === e.key && <EntryDetail session={session} entry={e} />}
        </EntryRow>
      ))}
    </ul>
  );
}

export function ResultGrid({ list, open, onOpen }: Readonly<Omit<ResultsProps, 'session'>>) {
  return (
    <TileGrid>
      {list.map((e) => (
        <EntryTile
          key={e.key}
          look={{ picture: picture(e, 28), name: e.name, on: open === e.key }}
          events={{
            draggable: true,
            onDragStart: (ev) => startDrag(ev, e.drag),
            onClick: () => onOpen(open === e.key ? undefined : e.key),
            title: [e.name, e.sub, e.source === 'SRD' ? '' : e.source].filter(Boolean).join('\n'),
          }}
        />
      ))}
    </TileGrid>
  );
}
