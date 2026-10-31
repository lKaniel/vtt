import {
  ABILITIES,
  abilityMod,
  abilityName,
  abilityScores,
  partsOf,
  STANDARD_ARRAY,
  type Ability,
  type Character,
} from '@vtt/shared';
import {
  adjustPointBuy,
  assignStandard,
  pointsLeft,
  rollAbilityScores,
  setBackgroundBonus,
  toggleBonusChoice,
} from '../../creator.ts';
import type { StepProps } from './OriginSteps.tsx';
import { Chips, Detail, StepHead } from './Parts.tsx';

type Method = Character['method'];
const METHODS: { id: Method; label: string }[] = [
  { id: 'point-buy', label: 'Point buy' },
  { id: 'standard', label: 'Standard array' },
  { id: 'roll', label: 'Roll 4d6' },
  { id: 'manual', label: 'Manual' },
];

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

/** Switching method starts from that method's usual scores. */
function withMethod(c: Character, method: Method): Character {
  if (method === 'point-buy') return { ...c, method, base: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } };
  if (method === 'standard') {
    const base = Object.fromEntries(ABILITIES.map((a, i) => [a, STANDARD_ARRAY[i]])) as Record<Ability, number>;
    return { ...c, method, base };
  }
  if (method === 'roll') return { ...c, method, base: rollAbilityScores() };
  return { ...c, method };
}

export function AbilitiesStep({ c, set }: Readonly<StepProps>) {
  const final = abilityScores(c);
  return (
    <div className="cc-split">
      <div>
        <StepHead
          title="Abilities"
          hint="Your six ability scores, before and after bonuses."
          right={<MethodExtra c={c} set={set} />}
        />
        <Chips options={METHODS} value={c.method} onPick={(m) => set(withMethod(c, m))} />
        <table className="cc-abilities">
          <thead>
            <tr>
              <th>Ability</th>
              <th>Score</th>
              <th>Bonus</th>
              <th>Total</th>
              <th>Mod</th>
            </tr>
          </thead>
          <tbody>
            {ABILITIES.map((a) => (
              <tr key={a}>
                <th>{abilityName(a)}</th>
                <td>
                  <ScoreInput c={c} a={a} set={set} />
                </td>
                <td className="cc-bonus">{final[a] - c.base[a] ? signed(final[a] - c.base[a]) : ''}</td>
                <td className="cc-total">{final[a]}</td>
                <td className="cc-mod">{signed(abilityMod(final[a]))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <aside className="cc-aside">
        <BonusPicker c={c} set={set} />
      </aside>
    </div>
  );
}

/** Points left for point buy, a re-roll button for rolled scores. */
function MethodExtra({ c, set }: Readonly<StepProps>) {
  if (c.method === 'point-buy') return <span className="cc-counter">{pointsLeft(c)} points left</span>;
  if (c.method !== 'roll') return null;
  return (
    <button className="btn small" onClick={() => set(withMethod(c, 'roll'))}>
      Roll again
    </button>
  );
}

function ScoreInput({ c, a, set }: Readonly<StepProps & { a: Ability }>) {
  const value = c.base[a];
  if (c.method === 'point-buy') {
    return (
      <span className="cc-stepper">
        <button className="cc-step-btn" onClick={() => set(adjustPointBuy(c, a, -1))} aria-label={`Lower ${a}`}>
          −
        </button>
        <span>{value}</span>
        <button className="cc-step-btn" onClick={() => set(adjustPointBuy(c, a, 1))} aria-label={`Raise ${a}`}>
          +
        </button>
      </span>
    );
  }
  if (c.method === 'standard') {
    return (
      <select value={value} onChange={(e) => set(assignStandard(c, a, Number(e.target.value)))}>
        {STANDARD_ARRAY.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="number"
      min={c.method === 'roll' ? 3 : 1}
      max={c.method === 'roll' ? 18 : 30}
      value={value}
      onChange={(e) => set({ ...c, base: { ...c.base, [a]: Number(e.target.value) || 1 } })}
    />
  );
}

function BonusPicker({ c, set }: Readonly<StepProps>) {
  const p = partsOf(c);
  if (c.rules === '2024') return <BackgroundBonus c={c} set={set} />;
  const choice = p.species?.bonusChoice;
  if (!choice) {
    return (
      <Detail title="Bonuses">
        <p className="cc-facts">Your race sets your ability bonuses.</p>
      </Detail>
    );
  }
  return (
    <Detail title={`${p.species!.name}: +${choice.amount} to ${choice.count}`}>
      <div className="cc-chips">
        {choice.from.map((a) => (
          <button key={a} className={c.bonusPicks[a] ? 'chip on' : 'chip'} onClick={() => set(toggleBonusChoice(c, a))}>
            {abilityName(a)}
          </button>
        ))}
      </div>
    </Detail>
  );
}

/** A +2 and a +1 on different abilities; either alone while the other is still unpicked. */
function bonusFor(c: Character, two: Ability | undefined, one: Ability | undefined): Character {
  if (two && one && two !== one) return setBackgroundBonus(c, { plus2: two, plus1: one });
  const picks: Partial<Record<Ability, number>> = {};
  if (two) picks[two] = 2;
  if (one && one !== two) picks[one] = 1;
  return { ...c, bonusPicks: picks };
}

function BackgroundBonus({ c, set }: Readonly<StepProps>) {
  const bg = partsOf(c).background;
  const abilities = bg?.abilities ?? [];
  const plus2 = abilities.find((a) => c.bonusPicks[a] === 2);
  const plus1 = abilities.find((a) => c.bonusPicks[a] === 1);
  const each = abilities.length > 0 && abilities.every((a) => c.bonusPicks[a] === 1);
  const pick = (two: Ability | undefined, one: Ability | undefined) => set(bonusFor(c, two, one));

  const options = abilities.map((a) => ({ id: a, label: abilityName(a) }));
  return (
    <Detail title={`${bg?.name ?? 'Background'} bonuses`}>
      <p className="cc-facts">Raise one ability by 2 and another by 1, or all three by 1.</p>
      <p className="cc-label">+2</p>
      <Chips
        options={options}
        value={each ? undefined : plus2}
        onPick={(a) => pick(a, plus1 === a ? undefined : plus1)}
      />
      <p className="cc-label">+1</p>
      <Chips
        options={options}
        value={each ? undefined : plus1}
        onPick={(a) => pick(plus2 === a ? undefined : plus2, a)}
      />
      <button className={each ? 'chip on' : 'chip'} onClick={() => set(setBackgroundBonus(c, 'each'))}>
        +1 to all three
      </button>
    </Detail>
  );
}
