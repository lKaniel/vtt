import {
  ABILITIES,
  type Ability,
  abilityName,
  abilityScores,
  type Character,
  characterIssues,
  characterMaxHp,
  levelUp,
  partsOf,
} from '@vtt/system-dnd5e';
import { useState } from 'react';
import { api } from '../account-api.ts';
import { characterSummary, levelUpPlan, spellChoices } from '../creator.ts';
import { SpellPicker } from './creator/PickSteps.tsx';
import { Chips, Detail, RichText, TraitList } from './creator/Parts.tsx';

type Bonus = Partial<Record<Ability, number>>;

/** Gaining a level: hit points, an ability score improvement, a subclass and new spells. */
export function LevelUpScreen({
  character: c,
  onDone,
  onCancel,
}: Readonly<{ character: Character; onDone: () => void; onCancel: () => void }>) {
  const plan = levelUpPlan(c);
  const [hp, setHp] = useState(plan.average);
  const [improvement, setImprovement] = useState<Bonus>({});
  const [subclass, setSubclass] = useState(c.subclass);
  const [spells, setSpells] = useState(c.spells);
  const [error, setError] = useState<string>();
  const next = levelUp(c, { hp, improvement: plan.improvement ? improvement : undefined, subclass, spells });
  const issues = characterIssues(next);
  const casts = spellChoices(next).limits.maxLevel > 0;

  const confirm = async () => {
    try {
      await api.saveCharacter(next);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="levelup">
      <header className="cc-head">
        <h1 className="menu-title">
          {c.name} reaches level {plan.level}
        </h1>
        <p className="cc-line">{characterSummary(next)}</p>
      </header>
      <div className="levelup-body">
        <section className="frame levelup-col">
          <Detail title="Hit points">
            <HitPoints die={plan.hitDie} average={plan.average} hp={hp} setHp={setHp} />
            <p className="cc-facts">
              Maximum hit points: {characterMaxHp(c)} → <strong>{characterMaxHp(next)}</strong>
            </p>
          </Detail>
          {plan.improvement && <Improvement c={c} value={improvement} onChange={setImprovement} />}
          {plan.subclass && <SubclassPicker c={next} value={subclass} onPick={setSubclass} />}
          <NewFeatures c={next} level={plan.level} />
        </section>
        {casts && (
          <section className="frame levelup-col wide">
            <SpellPicker c={next} set={(x) => setSpells(x.spells)} />
          </section>
        )}
      </div>
      <LevelUpFooter
        message={error ?? issues[0]}
        disabled={issues.length > 0}
        onCancel={onCancel}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}

function LevelUpFooter({
  message,
  disabled,
  onCancel,
  onConfirm,
}: Readonly<{ message?: string; disabled: boolean; onCancel: () => void; onConfirm: () => void }>) {
  return (
    <footer className="cc-foot">
      <button className="btn" onClick={onCancel}>
        Cancel
      </button>
      {message && <span className="menu-error">{message}</span>}
      <span className="cc-foot-space" />
      <button className="btn primary" disabled={disabled} onClick={onConfirm}>
        Level up
      </button>
    </footer>
  );
}

function SubclassPicker({
  c,
  value,
  onPick,
}: Readonly<{ c: Character; value: string | undefined; onPick: (id: string) => void }>) {
  const options = partsOf(c).options?.subclasses ?? [];
  return (
    <Detail title="Subclass">
      <Chips options={options.map((s) => ({ id: s.id, label: s.name }))} value={value} onPick={onPick} />
      <RichText text={options.find((s) => s.id === value)?.description ?? ''} className="rich small" />
    </Detail>
  );
}

function NewFeatures({ c, level }: Readonly<{ c: Character; level: number }>) {
  const features = (partsOf(c).cls?.features ?? []).filter((f) => f.level === level);
  return (
    <Detail title={features.length ? 'New features' : 'Features'}>
      {features.length ? (
        <TraitList traits={features} />
      ) : (
        <p className="cc-facts">No new class features at this level.</p>
      )}
    </Detail>
  );
}

function HitPoints({
  die,
  average,
  hp,
  setHp,
}: Readonly<{ die: number; average: number; hp: number; setHp: (n: number) => void }>) {
  return (
    <div className="levelup-hp">
      <button className="btn" onClick={() => setHp(average)}>
        Take {average}
      </button>
      <button className="btn" onClick={() => setHp(Math.floor(Math.random() * die) + 1)}>
        Roll d{die}
      </button>
      <span className="levelup-roll">+{hp} and your Constitution modifier</span>
    </div>
  );
}

/** Two +1s or one +2, never past 20. */
function Improvement({ c, value, onChange }: Readonly<{ c: Character; value: Bonus; onChange: (b: Bonus) => void }>) {
  const scores = abilityScores(c);
  const spent = Object.values(value).reduce((a, v) => a + v, 0);
  const bump = (a: Ability) => {
    const current = value[a] ?? 0;
    const full = spent >= 2 || scores[a] + current >= 20;
    onChange(
      full ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== a)) : { ...value, [a]: current + 1 },
    );
  };
  return (
    <Detail title={`Ability score improvement (${2 - spent} left)`}>
      <div className="cc-chips">
        {ABILITIES.map((a) => (
          <button key={a} className={value[a] ? 'chip on' : 'chip'} onClick={() => bump(a)}>
            {abilityName(a)} {scores[a]}
            {value[a] ? ` +${value[a]}` : ''}
          </button>
        ))}
      </div>
      <button className="link" onClick={() => onChange({})}>
        Clear
      </button>
    </Detail>
  );
}
