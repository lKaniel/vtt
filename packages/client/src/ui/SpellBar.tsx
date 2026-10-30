import type { FeatureSheet, Spell, TokenView } from '@vtt/shared';
import type { Session } from '../session.ts';
import { describeSpell, featureTitle, lowestSlot, ORDINAL } from '../spell-text.ts';

const ACTION_ICON: Record<string, string> = {
  action: '●',
  bonus: '▲',
  reaction: '↺',
  minute: '⧗',
  hour: '⧗',
  free: '✦',
};

/** Spell tiles (cantrips first, then by level) and the class features you can use. */
export function SpellBar({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const caster = token.sheet?.caster;
  const spells = [...(caster?.spells ?? [])].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const features = token.sheet?.features.filter((f) => f.action) ?? [];
  if (!spells.length && !features.length) return null;
  return (
    <div className="spellbar">
      {caster && <SlotPips left={caster.left} slots={caster.slots} />}
      <div className="hotbar-slots">
        {spells.map((s) => (
          <SpellTile key={s.id} session={session} token={token} spell={s} />
        ))}
        {features.map((f) => (
          <FeatureTile key={f.id} session={session} token={token} feature={f} />
        ))}
      </div>
      <AimingControls session={session} token={token} />
    </div>
  );
}

function SlotPips({ left, slots }: Readonly<{ left: number[]; slots: number[] }>) {
  return (
    <div className="slot-pips" title="Spell slots left per level">
      {slots.map((n, i) =>
        n ? (
          <span key={i} className="slot-level">
            <span className="muted">{ORDINAL[i + 1]}</span>
            {Array.from({ length: n }, (_, k) => (
              <span key={k} className={k < left[i]! ? 'pip on' : 'pip'} />
            ))}
          </span>
        ) : null,
      )}
    </div>
  );
}

function SpellTile({ session, token, spell }: Readonly<{ session: Session; token: TokenView; spell: Spell }>) {
  const slot = lowestSlot(token, spell);
  const aimed = session.aiming?.spell.id === spell.id;
  const cls = ['slot', 'spell', aimed && 'armed', slot === undefined && 'spent', !spell.automated && 'manual'];
  return (
    <button
      className={cls.filter(Boolean).join(' ')}
      disabled={slot === undefined}
      title={describeSpell(spell)}
      onClick={() => session.aim(aimed ? undefined : spell.id, slot)}
    >
      <span className="slot-key">{spell.level || 'C'}</span>
      <span className="slot-icon">{ACTION_ICON[spell.castingTime]}</span>
      <span className="slot-name">{spell.name}</span>
    </button>
  );
}

function FeatureTile({
  session,
  token,
  feature,
}: Readonly<{ session: Session; token: TokenView; feature: FeatureSheet }>) {
  const empty = feature.left === 0;
  return (
    <button
      className={empty ? 'slot feature spent' : 'slot feature'}
      disabled={empty}
      title={featureTitle(feature)}
      onClick={() => session.useFeature(token.id, feature.id)}
    >
      {feature.max !== undefined && <span className="slot-key">{feature.left}</span>}
      <span className="slot-icon">{ACTION_ICON[feature.action ?? 'free']}</span>
      <span className="slot-name">{feature.name}</span>
    </button>
  );
}

/** While a spell is aimed: which slot to cast it with, what to summon, and casting with fewer targets. */
function AimingControls({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const aiming = session.aiming;
  const left = token.sheet?.caster?.left ?? [];
  if (!aiming) return null;
  const { spell } = aiming;
  const levels = left.map((n, i) => i + 1).filter((l) => l >= spell.level && left[l - 1]! > 0);
  return (
    <div className="aiming">
      {spell.level > 0 &&
        levels.map((l) => (
          <button key={l} className={l === aiming.slot ? 'small on' : 'small'} onClick={() => session.aim(spell.id, l)}>
            {ORDINAL[l]}
          </button>
        ))}
      {spell.summon && (
        <select value={aiming.summon} onChange={(e) => session.chooseSummon(e.target.value)}>
          {spell.summon.options.map((o) => (
            <option key={o.monster} value={o.monster}>
              {o.count > 1 ? `${o.count} × ` : ''}
              {o.monster}
            </option>
          ))}
        </select>
      )}
      {aiming.mode === 'creatures' && aiming.picks.length > 0 && (
        <button className="small" onClick={() => session.confirmCast()}>
          Cast at {aiming.picks.length}
        </button>
      )}
    </div>
  );
}
