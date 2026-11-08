import { givenProficiencies, partsOf, proficiencyChoices, toggleProficiencyPick } from '@vtt/system-dnd5e';
import { t } from '../../i18n/index.ts';
import type { StepProps } from './OriginSteps.tsx';
import { ProficiencyList, ProficiencyPick } from './ProficiencyParts.tsx';

// The creator's armor, weapons, tools and languages: what the class,
// species and background give, and the picks they offer (a dwarf's tool,
// an acolyte's two languages, a bard's three instruments).

export function ProficiencySection({ c, set }: Readonly<StepProps>) {
  const parts = partsOf(c);
  const content = parts.book.content;
  const choices = proficiencyChoices(c, parts);
  return (
    <section className="mt-4 flex flex-col gap-3" aria-label={t('creator.other')}>
      <h3 className="m-0 font-display text-base text-gold">{t('creator.other')}</h3>
      <p className="cc-hint">{t('creator.given')}</p>
      <ProficiencyList list={givenProficiencies(c, parts)} content={content} />
      {choices.map((choice) => (
        <ProficiencyPick
          key={choice.key}
          choice={choice}
          content={content}
          onToggle={(id) => set(toggleProficiencyPick(c, choice, id))}
        />
      ))}
    </section>
  );
}
