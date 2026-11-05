import { type Character, type ChoiceDue, characterClasses, choicesDue, classFeature, partsOf } from '@vtt/system-dnd5e';
import { toggleOption } from '../../content/creator.ts';
import { t } from '../../i18n/index.ts';
import { Toggle } from '../kit/toggle.tsx';
import type { StepProps } from './OriginSteps.tsx';
import { Detail, TraitList } from './Parts.tsx';

// The options each class asks the player to pick at its level: a fighting
// style, invocations, metamagic, a druid's land, a dragon ancestor.

/** The choices `classId` has at the character's level in it. */
export function choicesOf(c: Character, classId: string): ChoiceDue[] {
  const k = characterClasses(c).find((x) => x.class === classId);
  const cls = partsOf(c).book.content.classes.get(classId);
  return k && cls ? choicesDue(cls, k.level, c.features, k.subclass) : [];
}

export function ClassChoices({ c, set, classId }: Readonly<StepProps & { classId: string }>) {
  return choicesOf(c, classId).map((due) => (
    <Detail key={due.id} title={t('creator.choice', { name: due.name, picked: due.picked.length, count: due.count })}>
      <div className="cc-chips" data-slot="class-choice">
        {due.options.map((o) => (
          <Toggle
            key={o.id}
            pressed={due.picked.includes(o.id)}
            disabled={!due.picked.includes(o.id) && due.picked.length >= due.count && due.count > 1}
            onPressedChange={() => set(toggleOption(c, classId, o.id))}
          >
            {o.name}
          </Toggle>
        ))}
      </div>
      <PickedOptions c={c} classId={classId} picked={due.picked} />
    </Detail>
  ));
}

/** What the picked options do, in the class's words. */
function PickedOptions({ c, classId, picked }: Readonly<{ c: Character; classId: string; picked: string[] }>) {
  const content = partsOf(c).book.content;
  const traits = picked.flatMap((id) => {
    const f = classFeature(`${classId}/${id}`, content);
    return f ? [{ name: f.name, description: f.description }] : [];
  });
  return traits.length ? <TraitList traits={traits} /> : null;
}
