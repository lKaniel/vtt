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
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void bake.optimise()}
        title={t('bake.optimiseHint')}
        aria-label={t('bake.optimise')}
      >
        <GaugeIcon />
      </Button>
    );
  }
  const changed = bake.changedSince();
  return (
    <span className="flex items-center">
      <Button
        variant="default"
        size="icon-sm"
        aria-pressed
        onClick={() => bake.edit()}
        title={t('bake.editHint')}
        aria-label={t('bake.edit')}
      >
        <PencilIcon />
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
  const label = `${t(step === 'load' ? 'bake.loading' : 'bake.drawing', { pct })}. ${t('bake.stop')}`;
  return (
    <Button variant="ghost" size="sm" onClick={() => session.bake.cancel()} title={label} aria-label={label}>
      <LoaderIcon className="animate-spin" />
      {pct}%
    </Button>
  );
}
