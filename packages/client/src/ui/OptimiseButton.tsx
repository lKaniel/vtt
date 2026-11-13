import { GaugeIcon, LoaderIcon, PencilIcon, RefreshCwIcon } from 'lucide-react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';

/**
 * GM, on a 2D scene: Optimise draws the still tiles into one picture per
 * floor (session-bake.ts), so a big map runs well on slow computers; Edit
 * goes back to every tile drawn. While it runs, it shows how far it got and
 * a click stops it. When baked tiles changed since, a second button
 * optimises again.
 */
export function OptimiseButton({ session }: Readonly<{ session: Session }>) {
  const bake = session.bake;
  if (!bake.canOptimise) return null;
  if (bake.running) return <Running session={session} />;
  if (!bake.optimised) {
    return (
      <Button variant="ghost" size="sm" onClick={() => void bake.optimise()} title={t('bake.optimiseHint')}>
        <GaugeIcon />
        {t('bake.optimise')}
      </Button>
    );
  }
  const changed = bake.changedSince();
  return (
    <span className="flex items-center">
      <Button variant="ghost" size="sm" onClick={() => bake.edit()} title={t('bake.editHint')}>
        <PencilIcon />
        {t('bake.edit')}
      </Button>
      {changed > 0 && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void bake.optimise()}
          title={t('bake.again', { count: changed })}
          aria-label={t('bake.again', { count: changed })}
        >
          <RefreshCwIcon className="text-gold-bright" />
        </Button>
      )}
    </span>
  );
}

function Running({ session }: Readonly<{ session: Session }>) {
  const { step, done, total } = session.bake.running!;
  const pct = total ? Math.floor((done / total) * 100) : 0;
  return (
    <Button variant="ghost" size="sm" onClick={() => session.bake.cancel()} title={t('bake.stop')}>
      <LoaderIcon className="animate-spin" />
      {t(step === 'load' ? 'bake.loading' : 'bake.drawing', { pct })}
    </Button>
  );
}
