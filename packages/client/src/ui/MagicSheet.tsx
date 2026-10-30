import type { TokenView } from '@vtt/shared';
import type { Session } from '../session.ts';
import { describeSpell } from '../spell-text.ts';

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
      <ul className="sheet-list">
        {token.concentration && (
          <li className="item">
            <span>Concentrating on {token.concentration.name}</span>
            <button className="small" onClick={() => session.dropConcentration(token.id)}>
              Stop
            </button>
          </li>
        )}
        {effects.map((e) => (
          <li key={e.id} className="item">
            <span>
              {e.name}
              {e.conditions?.length ? <span className="muted"> ({e.conditions.join(', ')})</span> : null}
              {e.rounds !== undefined && <span className="muted"> · {e.rounds} rd</span>}
            </span>
            {gm && (
              <button className="small" title="End this effect" onClick={() => session.removeEffect(token.id, e.id)}>
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
  const spells = [...caster.spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return (
    <>
      <h4>
        Spells{' '}
        <span className="muted">
          · save DC {caster.dc} · attack {signed(caster.attack)}
        </span>
      </h4>
      <ul className="sheet-list">
        {spells.map((s) => (
          <li key={s.id} title={describeSpell(s)}>
            <span className="muted">{s.level || 'C'}</span> {s.name}
            {s.concentration && <span className="muted"> · concentration</span>}
            {!s.automated && <span className="muted"> · manual</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

function Features({ token }: Readonly<{ token: TokenView }>) {
  const features = token.sheet?.features ?? [];
  if (!features.length) return null;
  return (
    <>
      <h4>Features</h4>
      <ul className="sheet-list">
        {features.map((f) => (
          <li key={f.id} title={f.description}>
            {f.name}
            {f.max !== undefined && (
              <span className="muted">
                {' '}
                · {f.left}/{f.max} ({f.recharge === 'long' ? 'long rest' : 'short rest'})
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
