import { type Character, type Edition, newCharacter } from '@vtt/system-dnd5e';
import { useState } from 'react';
import { creatorSteps, setEdition, type StepId, type StepInfo } from '../content/creator.ts';
import { AbilitiesStep } from './creator/AbilitiesStep.tsx';
import { EquipmentStep } from './creator/KitStep.tsx';
import { BackgroundStep, ClassStep, SpeciesStep, type StepProps } from './creator/OriginSteps.tsx';
import { SkillsStep, SpellPicker } from './creator/PickSteps.tsx';
import { IdentityStep, Summary } from './creator/Summary.tsx';
import { t } from '../i18n/index.ts';
import { Button } from './kit/button.tsx';
import { Toggle } from './kit/toggle.tsx';
import { useHomebrewClasses } from './creator/use-homebrew.ts';
import { useSaveCharacter } from './creator/use-save.ts';
import { Pressable } from './kit/pressable.tsx';

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
  game,
  owner,
  rules,
  initial,
  onDone,
  onCancel,
}: Readonly<{
  /** The game the character belongs to. */
  game: string;
  owner: string;
  rules: Edition;
  initial?: Character;
  onDone: (saved: Character) => void;
  onCancel: () => void;
}>) {
  const [c, set] = useState<Character>(() => initial ?? newCharacter({ id: NEW, owner, rules }));
  const [stepId, setStep] = useState<StepId>('species');
  const { busy, error, save } = useSaveCharacter(game, onDone);
  const homebrew = useHomebrewClasses(game);
  const steps = creatorSteps(c);
  const index = Math.max(
    0,
    steps.findIndex((s) => s.id === stepId),
  );
  const step = steps[index]!;
  const problems = steps.flatMap((s) => s.issues);
  const View = STEP_VIEWS[step.id];

  return (
    <div className="cc">
      <header className="cc-head">
        <h1 className="menu-title">{initial ? `Edit ${initial.name}` : 'Create your hero'}</h1>
        <EditionPicker c={c} set={set} />
      </header>
      <StepNav steps={steps} current={step.id} onPick={setStep} />
      <main className="cc-main frame">
        <View c={c} set={set} homebrew={homebrew} />
        {step.issues.length > 0 && <p className="cc-issues">{step.issues.join(' ')}</p>}
        {index === steps.length - 1 && <ToFinish steps={steps} onPick={setStep} />}
      </main>
      <Summary c={c} />
      <CreatorFoot
        onCancel={onCancel}
        error={error}
        index={index}
        steps={steps}
        setStep={setStep}
        saving={busy}
        problems={problems}
        editing={!!initial}
        onSave={() => save({ ...c, id: c.id === NEW ? '' : c.id })}
      />
    </div>
  );
}

/** At the last step, what still keeps the character from being made, each a way back to its step. */
function ToFinish({ steps, onPick }: Readonly<{ steps: readonly StepInfo[]; onPick: (id: StepId) => void }>) {
  const open = steps.filter((s) => s.issues.length);
  if (!open.length) return null;
  return (
    <div className="cc-issues mt-4 flex flex-col items-start gap-1" data-slot="to-finish">
      <strong>{t('creator.toFinish')}</strong>
      <span className="text-sm">{t('creator.toFinishHint')}</span>
      {open.map((s) => (
        <Button key={s.id} variant="link" className="text-left whitespace-normal" onClick={() => onPick(s.id)}>
          {s.label}: {s.issues.join(' ')}
        </Button>
      ))}
    </div>
  );
}

function EditionPicker({ c, set }: Readonly<StepProps>) {
  return (
    <div className="cc-edition" title="Which rules this character follows">
      {(['2014', '2024'] as const).map((r) => (
        <Toggle key={r} pressed={c.rules === r} onPressedChange={() => r !== c.rules && set(setEdition(c, r))}>
          {r} rules
        </Toggle>
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
        <Pressable key={s.id} className={s.id === current ? 'cc-step on' : 'cc-step'} onClick={() => onPick(s.id)}>
          <span className="cc-step-num">{i + 1}</span>
          <span className="cc-step-label">{s.label}</span>
          <span className={s.issues.length ? 'cc-step-mark todo' : 'cc-step-mark done'} title={s.issues.join(' ')}>
            {s.issues.length ? '!' : '✓'}
          </span>
        </Pressable>
      ))}
    </nav>
  );
}

/** Cancel, Back, and Next or the save at the last step. */
function CreatorFoot({
  onCancel,
  error,
  index,
  steps,
  setStep,
  saving,
  problems,
  editing,
  onSave,
}: Readonly<{
  onCancel: () => void;
  error?: string;
  index: number;
  steps: readonly StepInfo[];
  setStep: (id: StepId) => void;
  saving: boolean;
  problems: string[];
  editing: boolean;
  onSave: () => void;
}>) {
  return (
    <footer className="cc-foot">
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      {error && <span className="menu-error">{error}</span>}
      <span className="cc-foot-space" />
      <Button variant="outline" disabled={index === 0} onClick={() => setStep(steps[index - 1]!.id)}>
        Back
      </Button>
      {index < steps.length - 1 ? (
        <Button onClick={() => setStep(steps[index + 1]!.id)}>Next</Button>
      ) : (
        <Button disabled={saving || problems.length > 0} title={problems.join(' ')} onClick={onSave}>
          {editing ? 'Save changes' : 'Create character'}
        </Button>
      )}
    </footer>
  );
}
