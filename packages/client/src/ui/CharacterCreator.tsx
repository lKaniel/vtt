import { newCharacter, type Character, type Edition } from '@vtt/shared';
import { useState } from 'react';
import { api, ApiError } from '../account-api.ts';
import { creatorSteps, setEdition, type StepId, type StepInfo } from '../creator.ts';
import { AbilitiesStep } from './creator/AbilitiesStep.tsx';
import { EquipmentStep } from './creator/KitStep.tsx';
import { BackgroundStep, ClassStep, SpeciesStep, type StepProps } from './creator/OriginSteps.tsx';
import { SkillsStep, SpellPicker } from './creator/PickSteps.tsx';
import { IdentityStep, Summary } from './creator/Summary.tsx';

/** A placeholder id until the server gives the character its own. */
const NEW = 'new';

const STEP_VIEWS: Record<StepId, (p: StepProps) => React.ReactNode> = {
  species: SpeciesStep,
  class: ClassStep,
  background: BackgroundStep,
  abilities: AbilitiesStep,
  skills: SkillsStep,
  spells: SpellPicker,
  equipment: EquipmentStep,
  identity: IdentityStep,
  level: () => null,
};

/** BG3-style character creation: steps on the left, choices in the middle, the sheet on the right. */
export function CharacterCreator({
  owner,
  rules,
  initial,
  onDone,
  onCancel,
}: Readonly<{
  owner: string;
  rules: Edition;
  initial?: Character;
  onDone: () => void;
  onCancel: () => void;
}>) {
  const [c, set] = useState<Character>(() => initial ?? newCharacter({ id: NEW, owner, rules }));
  const [stepId, setStep] = useState<StepId>('species');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const steps = creatorSteps(c);
  const index = Math.max(
    0,
    steps.findIndex((s) => s.id === stepId),
  );
  const step = steps[index]!;
  const problems = steps.flatMap((s) => s.issues);
  const View = STEP_VIEWS[step.id];

  const save = async () => {
    setBusy(true);
    try {
      await api.saveCharacter({ ...c, id: c.id === NEW ? '' : c.id });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError && e.issues.length ? e.issues.join(' ') : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc">
      <header className="cc-head">
        <h1 className="menu-title">{initial ? `Edit ${initial.name}` : 'Create your hero'}</h1>
        <EditionPicker c={c} set={set} />
      </header>
      <StepNav steps={steps} current={step.id} onPick={setStep} />
      <main className="cc-main frame">
        <View c={c} set={set} />
        {step.issues.length > 0 && <p className="cc-issues">{step.issues.join(' ')}</p>}
      </main>
      <Summary c={c} />
      <footer className="cc-foot">
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        {error && <span className="menu-error">{error}</span>}
        <span className="cc-foot-space" />
        <button className="btn" disabled={index === 0} onClick={() => setStep(steps[index - 1]!.id)}>
          Back
        </button>
        {index < steps.length - 1 ? (
          <button className="btn primary" onClick={() => setStep(steps[index + 1]!.id)}>
            Next
          </button>
        ) : (
          <button
            className="btn primary"
            disabled={busy || problems.length > 0}
            title={problems.join(' ')}
            onClick={() => void save()}
          >
            {initial ? 'Save changes' : 'Create character'}
          </button>
        )}
      </footer>
    </div>
  );
}

function EditionPicker({ c, set }: Readonly<StepProps>) {
  return (
    <div className="cc-edition" title="Which rules this character follows">
      {(['2014', '2024'] as const).map((r) => (
        <button
          key={r}
          className={c.rules === r ? 'chip on' : 'chip'}
          onClick={() => r !== c.rules && set(setEdition(c, r))}
        >
          {r} rules
        </button>
      ))}
    </div>
  );
}

function StepNav({
  steps,
  current,
  onPick,
}: Readonly<{ steps: StepInfo[]; current: StepId; onPick: (id: StepId) => void }>) {
  return (
    <nav className="cc-steps">
      {steps.map((s, i) => (
        <button key={s.id} className={s.id === current ? 'cc-step on' : 'cc-step'} onClick={() => onPick(s.id)}>
          <span className="cc-step-num">{i + 1}</span>
          <span className="cc-step-label">{s.label}</span>
          <span className={s.issues.length ? 'cc-step-mark todo' : 'cc-step-mark done'} title={s.issues.join(' ')}>
            {s.issues.length ? '!' : '✓'}
          </span>
        </button>
      ))}
    </nav>
  );
}
