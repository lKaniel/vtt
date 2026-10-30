import type { TokenView } from '@vtt/shared';
import { effectIcon } from '../icons.ts';
import { effectTone, hpBar, initials } from '../vitals.ts';
import { IconFace } from './Icon.tsx';

/** A framed face: the token's image, or its initials on its colour. */
export function Face({ token, className = '' }: Readonly<{ token: TokenView; className?: string }>) {
  const style = token.img
    ? { backgroundImage: `url(${token.img})` }
    : {
        background: `radial-gradient(circle at 35% 30%, ${token.color}, color-mix(in srgb, ${token.color} 35%, #000))`,
      };
  return (
    <span className={`face ${className}`} style={style}>
      {!token.img && <span className="face-initials">{initials(token.name)}</span>}
    </span>
  );
}

export function HpBar({ token, showLabel = true }: Readonly<{ token: TokenView; showLabel?: boolean }>) {
  const bar = hpBar(token);
  if (!bar) return null;
  return (
    <span className={`hpbar hp-${bar.tone}`} title={`Hit points: ${bar.label}`}>
      <span className="hpbar-fill" style={{ width: `${bar.percent}%` }} />
      {showLabel && <span className="hpbar-label">{bar.label}</span>}
    </span>
  );
}

/** Small badges for concentration and each effect on the creature. */
export function EffectBadges({ token }: Readonly<{ token: TokenView }>) {
  const effects = token.effects ?? [];
  if (!effects.length && !token.concentration) return null;
  return (
    <span className="badges">
      {token.concentration && (
        <span className="badge helpful" title={`Concentrating on ${token.concentration.name}`}>
          <IconFace icon={{ glyph: 'eye', tint: 'arcane' }} size={12} />
        </span>
      )}
      {effects.map((e) => (
        <span key={e.id} className={`badge ${effectTone(e)}`} title={effectTitle(e)}>
          <IconFace icon={effectIcon(e)} size={12} />
          {e.rounds !== undefined && <span className="badge-rounds">{e.rounds}</span>}
        </span>
      ))}
    </span>
  );
}

function effectTitle(e: NonNullable<TokenView['effects']>[number]): string {
  const conditions = e.conditions?.length ? ` (${e.conditions.join(', ')})` : '';
  const rounds = e.rounds === undefined ? '' : `, ${e.rounds} rounds left`;
  return `${e.name}${conditions}${rounds}`;
}
