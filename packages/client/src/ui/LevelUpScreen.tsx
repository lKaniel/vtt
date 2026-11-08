import {
  ABILITIES,
  type Ability,
  abilityName,
  abilityScores,
  type Character,
  type Class,
  characterClasses,
  characterIssues,
  characterMaxHp,
  levelUp,
  partsOf,
} from '@vtt/system-dnd5e';
import { useState } from 'react';
import { characterSummary, levelUpPlan, spellChoices, withHomebrewClass } from '../content/creator.ts';
import { classesToPick, useHomebrewClasses } from './creator/use-homebrew.ts';
import { ClassChoices, choicesOf } from './creator/ClassChoices.tsx';
import { useSaveCharacter } from './creator/use-save.ts';
import { SpellPicker } from './creator/PickSteps.tsx';
import { LevelUpProficiencies } from './creator/LevelUpProficiencies.tsx';
import { Chips, Detail, RichText, TraitList } from './creator/Parts.tsx';
import { Button } from './kit/button.tsx';
import { Toggle } from './kit/toggle.tsx';

type Bonus = Partial<Record<Ability, number>>;

/** Gaining a level: hit points, an ability score improvement, a subclass and new spells. */
export function LevelUpScreen({
  game,
  character: saved,
  onDone,
  onCancel,
}: Readonly<{ game: string; character: Character; onDone: () => void; onCancel: () => void }>) {
  const homebrew = useHomebrewClasses(game);
  const [classId, setClassId] = useState(saved.class);
  // A new homebrew class to multiclass into comes along on the character.
  const taking = (id: string) =>
    withHomebrewClass(
      saved,
      homebrew.find((h) => h.id === id),
    );
  const c = taking(classId);
  const plan = levelUpPlan(c, classId);
  const [hp, setHp] = useState(plan.average);
  const [improvement, setImprovement] = useState<Bonus>({});
  const [subclass, setSubclass] = useState<string>();
  const [spells, setSpells] = useState(c.spells);
  const [features, setFeatures] = useState(c.features);
  const [picks, setPicks] = useState(c.proficiencyPicks);
  const { busy, error, save } = useSaveCharacter(game, onDone);
  const choice = { hp, class: classId, improvement: improvementIf(plan, improvement), subclass, spells, features };
  const next = { ...levelUp(c, choice), proficiencyPicks: picks };
  const issues = levelUpIssues(plan, next);
  const casts = spellChoices(next, plan.classLevel, classId).limits.maxLevel > 0;
  const pickClass = (id: string) => {
    setClassId(id);
    setHp(levelUpPlan(taking(id), id).average);
    setSubclass(undefined);
    setImprovement({});
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
        <ChoicesColumn
          c={c}
          next={next}
          plan={plan}
          homebrew={homebrew}
          classId={classId}
          pickClass={pickClass}
          hp={hp}
          setHp={setHp}
          improvement={improvement}
          setImprovement={setImprovement}
          subclass={subclass}
          setSubclass={setSubclass}
        />
        <OptionsColumn next={next} classId={classId} setFeatures={setFeatures} />
        <LevelUpProficiencies before={c} next={next} set={setPicks} />
        {casts && (
          <section className="frame levelup-col wide">
            <SpellPicker c={next} classId={classId} level={plan.classLevel} set={(x) => setSpells(x.spells)} />
          </section>
        )}
      </div>
      <LevelUpFooter
        message={error ?? issues[0]}
        disabled={busy || issues.length > 0}
        onCancel={onCancel}
        onConfirm={() => save(next)}
      />
    </div>
  );
}

/** Why the level can't be taken yet: the class can't be taken, or the character breaks a rule. */
const levelUpIssues = (plan: { problem?: string }, next: Character) =>
  plan.problem ? [plan.problem] : characterIssues(next);

/** The improvement picked, when the level gives one. */
const improvementIf = (plan: { improvement: boolean }, picked: Bonus) => (plan.improvement ? picked : undefined);

/** The class options the new level asks to pick (a fighting style, invocations), when it asks any. */
function OptionsColumn({
  next,
  classId,
  setFeatures,
}: Readonly<{ next: Character; classId: string; setFeatures: (features: string[]) => void }>) {
  if (!choicesOf(next, classId).length) return null;
  return (
    <section className="frame levelup-col" data-slot="levelup-options">
      <ClassChoices c={next} set={(x) => setFeatures(x.features)} classId={classId} />
    </section>
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
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      {message && <span className="menu-error">{message}</span>}
      <span className="cc-foot-space" />
      <Button disabled={disabled} onClick={onConfirm}>
        Level up
      </Button>
    </footer>
  );
}

interface ChoicesProps {
  c: Character;
  next: Character;
  plan: ReturnType<typeof levelUpPlan>;
  homebrew: readonly Class[];
  classId: string;
  pickClass: (id: string) => void;
  hp: number;
  setHp: (hp: number) => void;
  improvement: Bonus;
  setImprovement: (b: Bonus) => void;
  subclass: string | undefined;
  setSubclass: (id: string) => void;
}

/** The class gaining the level, hit points, an improvement, a subclass and the new features. */
function ChoicesColumn(p: Readonly<ChoicesProps>) {
  const { c, next, plan, homebrew, classId, pickClass, hp, setHp, improvement, setImprovement } = p;
  const { subclass, setSubclass } = p;
  return (
    <section className="frame levelup-col">
      <ClassPicker c={c} homebrew={homebrew} value={classId} onPick={pickClass} />
      <Detail title="Hit points">
        <HitPoints die={plan.hitDie} average={plan.average} hp={hp} setHp={setHp} />
        <p className="cc-facts">
          Maximum hit points: {characterMaxHp(c)} → <strong>{characterMaxHp(next)}</strong>
        </p>
      </Detail>
      {plan.improvement && <Improvement c={c} value={improvement} onChange={setImprovement} />}
      {plan.subclass && <SubclassPicker c={next} classId={classId} value={subclass} onPick={setSubclass} />}
      <NewFeatures c={next} classId={classId} level={plan.classLevel} />
    </section>
  );
}

/** Which class gains the level: one the character has, or a new one to multiclass into. */
function ClassPicker({
  c,
  homebrew,
  value,
  onPick,
}: Readonly<{ c: Character; homebrew: readonly Class[]; value: string; onPick: (id: string) => void }>) {
  const taken = new Map(characterClasses(c).map((k) => [k.class, k.level]));
  const classes = classesToPick(partsOf(c).book.content.classes.values(), homebrew);
  const label = (id: string, name: string) => (taken.has(id) ? `${name} ${taken.get(id)}` : `${name} (new)`);
  return (
    <Detail title="Class">
      <Chips options={classes.map((k) => ({ id: k.id, label: label(k.id, k.name) }))} value={value} onPick={onPick} />
      {!taken.has(value) && (
        <p className="cc-facts">Multiclassing needs 13 in this class's main abilities and your current classes'.</p>
      )}
    </Detail>
  );
}

function SubclassPicker({
  c,
  classId,
  value,
  onPick,
}: Readonly<{ c: Character; classId: string; value: string | undefined; onPick: (id: string) => void }>) {
  const options = partsOf(c).book.origins.classes.find((o) => o.id === classId)?.subclasses ?? [];
  return (
    <Detail title="Subclass">
      <Chips options={options.map((s) => ({ id: s.id, label: s.name }))} value={value} onPick={onPick} />
      <RichText text={options.find((s) => s.id === value)?.description ?? ''} className="rich small" />
    </Detail>
  );
}

function NewFeatures({ c, classId, level }: Readonly<{ c: Character; classId: string; level: number }>) {
  const features = (partsOf(c).book.content.classes.get(classId)?.features ?? []).filter((f) => f.level === level);
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
      <Button variant="outline" onClick={() => setHp(average)}>
        Take {average}
      </Button>
      <Button variant="outline" onClick={() => setHp(Math.floor(Math.random() * die) + 1)}>
        Roll d{die}
      </Button>
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
          <Toggle key={a} pressed={!!value[a]} onPressedChange={() => bump(a)}>
            {abilityName(a)} {scores[a]}
            {value[a] ? ` +${value[a]}` : ''}
          </Toggle>
        ))}
      </div>
      <Button variant="link" onClick={() => onChange({})}>
        Clear
      </Button>
    </Detail>
  );
}
