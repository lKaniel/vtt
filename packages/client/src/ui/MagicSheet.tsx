import type { TokenView } from '@vtt/shared';
import { effectIcon, spellIcon } from '../icons.ts';
import type { Session } from '../session.ts';
import { ORDINAL } from '../spell-text.ts';
import { featureTip, spellTip } from '../tooltip.ts';
import { IconFace } from './Icon.tsx';
import { TipCard } from './Tip.tsx';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Spellcasting, class features and what's affecting the creature, for the character sheet. */
export function MagicSheet({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  return (
    <>
      <Effects session={session} token={token} />
      <Spells token={token} />
      <Features token={token} />
    </>
  );
}

function Effects({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const effects = token.effects ?? [];
  const gm = session.you?.role === 'gm';
  if (!effects.length && !token.concentration) return null;
  return (
    <>
      <h4>Affected by</h4>
      <ul className="rows">
        {token.concentration && (
          <li className="row">
            <IconFace icon={{ glyph: 'eye', tint: 'arcane' }} size={16} />
            <span className="row-name">Concentrating on {token.concentration.name}</span>
            <button className="btn small" onClick={() => session.dropConcentration(token.id)}>
              Stop
            </button>
          </li>
        )}
        {effects.map((e) => (
          <li key={e.id} className="row">
            <IconFace icon={effectIcon(e)} size={16} />
            <span className="row-name">{e.name}</span>
            <span className="row-detail">
              {[e.conditions?.join(', '), e.rounds !== undefined && `${e.rounds} rd`].filter(Boolean).join(' · ')}
            </span>
            {gm && (
              <button
                className="btn small"
                title="End this effect"
                onClick={() => session.removeEffect(token.id, e.id)}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function Spells({ token }: Readonly<{ token: TokenView }>) {
  const caster = token.sheet?.caster;
  if (!caster) return null;
  const levels = [...new Set(caster.spells.map((s) => s.level))].sort((a, b) => a - b);
  return (
    <>
      <h4>
        Spells{' '}
        <span className="muted">
          · save DC {caster.dc} · attack {signed(caster.attack)}
        </span>
      </h4>
      {levels.map((level) => (
        <div key={level} className="spell-level">
          <span className="spell-level-name">{level ? `${ORDINAL[level]} level` : 'Cantrips'}</span>
          <div className="bag">
            {caster.spells
              .filter((s) => s.level === level)
              .map((s) => (
                <span key={s.id} className="bag-slot" tabIndex={0} aria-label={s.name}>
                  <IconFace icon={spellIcon(s)} size={24} />
                  <TipCard tip={spellTip(s)} />
                </span>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}

function Features({ token }: Readonly<{ token: TokenView }>) {
  const features = token.sheet?.features ?? [];
  if (!features.length) return null;
  return (
    <>
      <h4>Features</h4>
      <ul className="rows">
        {features.map((f) => (
          <li key={f.id} className="row has-tip" tabIndex={0}>
            <span className="row-name">{f.name}</span>
            {f.max !== undefined && (
              <span className="row-detail">
                {f.left}/{f.max}
              </span>
            )}
            <TipCard tip={featureTip(f)} />
          </li>
        ))}
      </ul>
    </>
  );
}
