import { mediaEntry } from '@vtt/core';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { AssetPicture } from './AssetPicture.tsx';
import { Checkbox } from './kit/checkbox.tsx';
import { Slider } from './kit/slider.tsx';

// The tiles mode's Stamp tool settings (session/session-stamp.ts): what the
// brush holds, its turn and size, whether each stamp turns or sizes at
// random, and how far apart a drag scatters them. The GM picks what it
// holds in the Assets tab.

function Held({ session }: Readonly<{ session: Session }>) {
  const asset = session.editor.stamp.asset;
  const media = asset && mediaEntry(asset.src, asset.src.split('/').at(-1) ?? asset.src);
  if (!media) return <span className="muted text-xs">{t('stamp.empty')}</span>;
  const measuring = asset.kind === 'model' && !asset.size;
  return (
    <span className="flex min-w-0 items-center gap-2" title={asset.src}>
      <span className="asset-thumb h-10 w-10 shrink-0 p-0.5">
        <AssetPicture media={media} className="h-full w-full object-contain" />
      </span>
      <span className="min-w-0 truncate text-xs">
        {media.name}
        {measuring && <span className="muted block">{t('stamp.loading')}</span>}
      </span>
    </span>
  );
}

function Setting({
  label,
  hint,
  shown,
  children,
}: Readonly<{ label: string; hint: string; shown: string; children: React.ReactNode }>) {
  return (
    <label className="flex items-center gap-1.5 text-xs" title={hint}>
      <span className="w-12 shrink-0">{label}</span>
      {children}
      <span className="w-10 text-right tabular-nums">{shown}</span>
    </label>
  );
}

export function StampTools({ session }: Readonly<{ session: Session }>) {
  const stamp = session.editor.stamp;
  const look = stamp.look;
  return (
    <div className="flex w-64 flex-col gap-1.5 py-1" role="group" aria-label={t('stamp.title')}>
      <Held session={session} />
      <Setting label={t('stamp.turn')} hint={t('stamp.turnHint')} shown={`${look.turn}°`}>
        <Slider
          className="flex-1"
          aria-label={t('stamp.turn')}
          min={0}
          max={345}
          step={15}
          value={[look.turn]}
          onValueChange={([n]) => stamp.setLook({ turn: n! })}
        />
      </Setting>
      <Setting label={t('stamp.size')} hint={t('stamp.sizeHint')} shown={`${Math.round(look.scale * 100)}%`}>
        <Slider
          className="flex-1"
          aria-label={t('stamp.size')}
          min={0.1}
          max={4}
          step={0.05}
          value={[look.scale]}
          onValueChange={([n]) => stamp.setLook({ scale: n! })}
        />
      </Setting>
      <Setting label={t('stamp.spacing')} hint={t('stamp.spacingHint')} shown={`×${look.spacing}`}>
        <Slider
          className="flex-1"
          aria-label={t('stamp.spacing')}
          min={0.25}
          max={3}
          step={0.25}
          value={[look.spacing]}
          onValueChange={([n]) => stamp.setLook({ spacing: n! })}
        />
      </Setting>
      <div className="flex gap-3 text-xs">
        <label className="flex items-center gap-1" title={t('stamp.randomTurnHint')}>
          <Checkbox checked={look.randomTurn} onCheckedChange={(on) => stamp.setLook({ randomTurn: on === true })} />
          {t('stamp.randomTurn')}
        </label>
        <label className="flex items-center gap-1" title={t('stamp.randomSizeHint')}>
          <Checkbox
            checked={look.randomSize > 0}
            onCheckedChange={(on) => stamp.setLook({ randomSize: on === true ? 0.2 : 0 })}
          />
          {t('stamp.randomSize')}
        </label>
      </div>
      <span className="muted text-[11px]">{t('stamp.keys')}</span>
    </div>
  );
}
