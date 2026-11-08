import type { TokenView } from '@vtt/system-dnd5e';
import { ChevronDownIcon, ChevronUpIcon, CircleHelpIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import { t } from '../i18n/index.ts';
import { actionTiles, filterTiles, type ActionTile, type Tab } from '../play/actions.ts';
import { barRows, type BarSize, wrapRow } from '../play/bar-size.ts';
import { hotbarTiles } from '../play/hotbar.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';

// The action bar's own controls: the switch between its full and compact
// sizes, its help mark, and the row pager of the compact bar.

/** A filtered tab still fills three rows, so the bar keeps its size. */
const MIN_TILES = 30;

/** The help mark and the switch between the full bar and the compact one. */
export function BarButtons({
  size,
  onSize,
  help,
}: Readonly<{ size: BarSize; onSize: (size: BarSize) => void; help: string }>) {
  const compact = size === 'compact';
  const label = compact ? t('bar.full') : t('bar.compact');
  return (
    <span className="ab-buttons">
      <span className="ab-help" role="img" aria-label={t('bar.help')} title={help}>
        <CircleHelpIcon />
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        title={label}
        aria-label={label}
        onClick={() => onSize(compact ? 'full' : 'compact')}
      >
        {compact ? <Maximize2Icon /> : <Minimize2Icon />}
      </Button>
    </span>
  );
}

/** The tiles the grid shows on a tab: the arranged bar, or that kind of tile. */
export function tabSlots(session: Session, token: TokenView, tab: Tab): (ActionTile | null)[] {
  if (tab === 'all') return hotbarTiles(token, session.journal.macroOf);
  const shown: (ActionTile | null)[] = filterTiles(actionTiles(token), tab);
  while (shown.length < MIN_TILES) shown.push(null);
  return shown;
}

/** Up and down through the rows of the compact bar, with which row is showing. */
export function RowPager({
  session,
  token,
  tab,
  row,
  onRow,
}: Readonly<{ session: Session; token: TokenView; tab: Tab; row: number; onRow: (row: number) => void }>) {
  const rows = barRows(tabSlots(session, token, tab).length);
  const at = wrapRow(row, rows);
  return (
    <span className="ab-pager">
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-4 w-5"
        title={t('bar.rowUp')}
        aria-label={t('bar.rowUp')}
        onClick={() => onRow(at - 1)}
      >
        <ChevronUpIcon />
      </Button>
      <span className="ab-row" aria-label={t('bar.row', { n: at + 1, of: rows })}>
        {at + 1}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-4 w-5"
        title={t('bar.rowDown')}
        aria-label={t('bar.rowDown')}
        onClick={() => onRow(at + 1)}
      >
        <ChevronDownIcon />
      </Button>
    </span>
  );
}
