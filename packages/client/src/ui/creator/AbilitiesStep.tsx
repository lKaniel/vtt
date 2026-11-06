import { MinusIcon, PlusIcon } from 'lucide-react';
import {
  ABILITIES,
  type Ability,
  abilityMod,
  abilityName,
  abilityScores,
  type Character,
  partsOf,
  POINT_BUY_BUDGET,
  scoreCost,
  STANDARD_ARRAY,
} from '@vtt/system-dnd5e';
import { flexibleBonusAbilities, pickFlexBonus } from '../../content/creator-custom.ts';
import { t } from '../../i18n/index.ts';
import {
  adjustPointBuy,
  assignStandard,
  pointsLeft,
  rollAbilityScores,
  setBackgroundBonus,
  toggleBonusChoice,
} from '../../content/creator.ts';
import type { StepProps } from './OriginSteps.tsx';
import { Chips, Detail, StepHead } from './Parts.tsx';
import { Button } from '../kit/button.tsx';
import { Input } from '../kit/input.tsx';
import { Toggle } from '../kit/toggle.tsx';
import { SelectField } from '../kit/select.tsx';

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
  const flex = flexibleBonusAbilities(c);
  const pointBuy = c.method === 'point-buy';
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
              {pointBuy && <th>{t('creator.cost')}</th>}
              {flex && <th>{t('creator.plus2')}</th>}
              {flex && <th>{t('creator.plus1')}</th>}
              {!flex && <th>Bonus</th>}
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
                {pointBuy && <td className="cc-cost">{scoreCost(c.base[a])}</td>}
                {flex && <FlexCell c={c} set={set} a={a} amount={2} />}
                {flex && <FlexCell c={c} set={set} a={a} amount={1} />}
                {!flex && <td className="cc-bonus">{final[a] - c.base[a] ? signed(final[a] - c.base[a]) : ''}</td>}
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

/** BG3's bonus columns: a toggle that puts the +2 or the +1 on this ability. */
function FlexCell({ c, set, a, amount }: Readonly<StepProps & { a: Ability; amount: 1 | 2 }>) {
  if (!flexibleBonusAbilities(c)?.includes(a)) return <td />;
  const label = t('creator.putBonus', { amount: `+${amount}`, ability: abilityName(a) });
  return (
    <td>
      <Toggle
        aria-label={label}
        title={label}
        pressed={c.bonusPicks[a] === amount}
        onPressedChange={() => set(pickFlexBonus(c, a, amount))}
      >
        +{amount}
      </Toggle>
    </td>
  );
}

/** Points left for point buy, a re-roll button for rolled scores. */
function MethodExtra({ c, set }: Readonly<StepProps>) {
  if (c.method === 'point-buy') {
    return <span className="cc-counter">{t('creator.points', { left: pointsLeft(c), budget: POINT_BUY_BUDGET })}</span>;
  }
  if (c.method !== 'roll') return null;
  return (
    <Button variant="outline" size="sm" onClick={() => set(withMethod(c, 'roll'))}>
      Roll again
    </Button>
  );
}

function ScoreInput({ c, a, set }: Readonly<StepProps & { a: Ability }>) {
  const value = c.base[a];
  if (c.method === 'point-buy') {
    return (
      <span className="cc-stepper">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => set(adjustPointBuy(c, a, -1))}
          aria-label={`Lower ${a}`}
        >
          <MinusIcon />
        </Button>
        <span>{value}</span>
        <Button variant="outline" size="icon-sm" onClick={() => set(adjustPointBuy(c, a, 1))} aria-label={`Raise ${a}`}>
          <PlusIcon />
        </Button>
      </span>
    );
  }
  if (c.method === 'standard') {
    return (
      <SelectField
        value={String(value)}
        aria-label={`${a} score`}
        onValueChange={(v) => set(assignStandard(c, a, Number(v)))}
        options={STANDARD_ARRAY.map((v) => ({ value: String(v), label: String(v) }))}
      />
    );
  }
  return (
    <Input
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
  if (flexibleBonusAbilities(c)) {
    return (
      <Detail title="Bonuses">
        <p className="cc-facts">{t('creator.freeBonusHere')}</p>
      </Detail>
    );
  }
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
          <Toggle key={a} pressed={!!c.bonusPicks[a]} onPressedChange={() => set(toggleBonusChoice(c, a))}>
            {abilityName(a)}
          </Toggle>
        ))}
      </div>
    </Detail>
  );
}

/** 2024: the background's +2 and +1 go in the table's bonus columns; or +1 to all three here. */
function BackgroundBonus({ c, set }: Readonly<StepProps>) {
  const bg = partsOf(c).background;
  const abilities = bg?.abilities ?? [];
  const each = abilities.length > 0 && abilities.every((a) => c.bonusPicks[a] === 1);
  return (
    <Detail title={`${bg?.name ?? 'Background'} bonuses`}>
      <p className="cc-facts">
        Raise one of {abilities.map(abilityName).join(', ')} by 2 and another by 1 in the table, or all three by 1.
      </p>
      <Toggle pressed={each} onPressedChange={() => set(setBackgroundBonus(c, 'each'))}>
        +1 to all three
      </Toggle>
    </Detail>
  );
}
