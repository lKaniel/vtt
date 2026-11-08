import type { SheetProps } from './sheet-props.ts';
import { canAct } from './sheet-props.ts';
import { t } from '../../i18n/index.ts';
import { Badge } from '../kit/badge.tsx';
import { Button } from '../kit/button.tsx';

// A pool class's points (an illusionist's Lucidity) above its features: what
// is left, what lasting uses hold, what reserved ones take off the maximums,
// and each held use with a button to let it go.

const shown = (n: number) => String(Math.round(n * 100) / 100);

export function PoolPanel(props: Readonly<SheetProps>) {
  const { sheet, value, session } = props;
  const pool = sheet.pool;
  if (!pool) return null;
  const holds = 'holds' in value ? (value.holds ?? []) : [];
  const rest = t(pool.recharge === 'short' ? 'pool.short' : 'pool.long');
  return (
    <div className="mb-3 flex flex-col gap-1" data-slot="pool">
      <div className="flex flex-wrap gap-1">
        <Badge title={t('pool.leftTitle', { name: pool.name, rest })}>
          {t('pool.left', { name: pool.name, left: shown(pool.left), max: shown(pool.max) })}
        </Badge>
        {pool.concurrent && (
          <Badge variant="muted" title={t('pool.concurrentTitle')}>
            {t('pool.concurrent', { held: shown(pool.concurrent.held), max: shown(pool.concurrent.max) })}
          </Badge>
        )}
        {pool.reserved > 0 && (
          <Badge variant="muted" title={t('pool.reservedTitle')}>
            {t('pool.reserved', { n: shown(pool.reserved) })}
          </Badge>
        )}
      </div>
      {holds.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap items-center gap-1 p-0" aria-label={t('pool.holding')}>
          {holds.map((h) => (
            <li key={h.id} className="flex items-center gap-1 text-sm">
              <span>
                {h.name} ({shown(h.cost)})
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!canAct(props)}
                title={t('pool.releaseTitle', { name: h.name })}
                onClick={() => session.requests.release(value.id, h.id)}
              >
                {t('pool.release')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
