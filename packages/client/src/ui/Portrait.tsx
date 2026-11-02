import type { TokenView } from '@vtt/system-dnd5e';
import { effectIcon } from '../icons.ts';
import { effectBadge, effectLeft } from '../session/session-time.ts';
import { portraitOf } from '../icon-art.ts';
import { effectTone, hpBar } from '../play/vitals.ts';
import { IconFace } from './Icon.tsx';

/** A framed face: the token's picture, or the default hooded stranger. */
export function Face({ token, className = '' }: Readonly<{ token: TokenView; className?: string }>) {
  return <span className={`face ${className}`} style={{ backgroundImage: `url(${portraitOf(token)})` }} />;
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

/** The game time now and whether a fight is on: what an effect's time left is counted in. */
export interface EffectClock {
  now: number;
  fighting: boolean;
}

type Timed = NonNullable<TokenView['effects']>[number];

/** Small badges for concentration and each effect on the creature, with the rounds or game time it has left. */
export function EffectBadges({ token, at }: Readonly<{ token: TokenView; at?: EffectClock }>) {
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
        <span key={e.id} className={`badge ${effectTone(e)}`} title={effectTitle(e, at)}>
          <IconFace icon={effectIcon(e)} size={12} />
          <BadgeTime effect={e} at={at} />
        </span>
      ))}
    </span>
  );
}

function BadgeTime({ effect, at }: Readonly<{ effect: Timed; at?: EffectClock }>) {
  const text = at ? effectBadge(effect, at) : effect.rounds?.toString();
  return text === undefined ? null : <span className="badge-rounds">{text}</span>;
}

function effectTitle(e: Timed, at?: EffectClock): string {
  const conditions = e.conditions?.length ? ` (${e.conditions.join(', ')})` : '';
  const left = at ? effectLeft(e, at) : e.rounds !== undefined && `${e.rounds} rd`;
  const time = left ? `, ${left}` : '';
  return `${e.name}${conditions}${time}`;
}
