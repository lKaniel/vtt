import { type Character, partsOf, proficiencyChoices, toggleProficiencyPick } from '@vtt/system-dnd5e';
import { t } from '../../i18n/index.ts';
import { Detail } from './Parts.tsx';
import { ProficiencyPick } from './ProficiencyParts.tsx';

// Proficiency picks a level up asks for: a new class's multiclass share (a
// bard's instrument), and picks a character made before they were asked never made.

/** The picks `next` offers that `before` hadn't made in full. */
function due(before: Character, next: Character) {
  const done = new Set(
    proficiencyChoices(before, partsOf(before))
      .filter((ch) => ch.picked.length === ch.pick)
      .map((ch) => ch.key),
  );
  return proficiencyChoices(next, partsOf(next)).filter((ch) => !done.has(ch.key));
}

export function LevelUpProficiencies({
  before,
  next,
  set,
}: Readonly<{ before: Character; next: Character; set: (picks: Character['proficiencyPicks']) => void }>) {
  const choices = due(before, next);
  if (!choices.length) return null;
  const content = partsOf(next).book.content;
  return (
    <section className="frame levelup-col" data-slot="levelup-proficiencies">
      <Detail title={t('creator.other')}>
        {choices.map((choice) => (
          <ProficiencyPick
            key={choice.key}
            choice={choice}
            content={content}
            onToggle={(id) => set(toggleProficiencyPick(next, choice, id).proficiencyPicks)}
          />
        ))}
      </Detail>
    </section>
  );
}
