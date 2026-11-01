import { abilityName, type Character, partsOf, skillName, type Species } from '@vtt/system-dnd5e';
import { chooseBackground, chooseClass, chooseSpecies } from '../../creator.ts';
import { Chips, Detail, OptionCard, RichText, StepHead, TraitList } from './Parts.tsx';

export interface StepProps {
  c: Character;
  set: (c: Character) => void;
}

const bonusText = (b: Partial<Record<string, number>>) =>
  Object.entries(b)
    .map(([a, v]) => `${a.toUpperCase()} +${v}`)
    .join(', ');

function speciesLine(s: Species): string {
  const parts = [s.sizes.join(' or '), `${s.speed} ft`];
  if (s.darkvision) parts.push(`darkvision ${s.darkvision} ft`);
  return parts.join(' · ');
}

export function SpeciesStep({ c, set }: Readonly<StepProps>) {
  const p = partsOf(c);
  const word = c.rules === '2014' ? 'race' : 'species';
  const subWord = c.rules === '2014' ? 'Subrace' : 'Lineage';
  return (
    <div className="cc-split">
      <div>
        <StepHead title={c.rules === '2014' ? 'Race' : 'Species'} hint={`Choose your ${word}.`} />
        <div className="cc-grid">
          {p.book.origins.species.map((s) => (
            <OptionCard
              key={s.id}
              title={s.name}
              sub={speciesLine(s)}
              on={s.id === c.species}
              onClick={() => set(chooseSpecies(c, s.id))}
            />
          ))}
        </div>
      </div>
      {p.species && (
        <aside className="cc-aside">
          <Detail title={p.species.name}>
            {Object.keys(p.species.bonuses).length > 0 && <p className="cc-facts">{bonusText(p.species.bonuses)}</p>}
            {p.species.subspecies.length > 0 && (
              <Chips
                options={p.species.subspecies.map((s) => ({ id: s.id, label: s.name }))}
                value={c.subspecies}
                onPick={(id) => set({ ...c, subspecies: id })}
              />
            )}
            {p.species.sizes.length > 1 && (
              <Chips
                options={p.species.sizes.map((s) => ({ id: s, label: s === 'small' ? 'Small' : 'Medium' }))}
                value={c.size}
                onPick={(size) => set({ ...c, size })}
              />
            )}
            <TraitList traits={p.species.traits} />
          </Detail>
          {p.subspecies && (
            <Detail title={`${subWord}: ${p.subspecies.name}`}>
              {Object.keys(p.subspecies.bonuses).length > 0 && (
                <p className="cc-facts">{bonusText(p.subspecies.bonuses)}</p>
              )}
              <RichText text={p.subspecies.description} />
              <TraitList traits={p.subspecies.traits} />
            </Detail>
          )}
        </aside>
      )}
    </div>
  );
}

export function ClassStep({ c, set }: Readonly<StepProps>) {
  const p = partsOf(c);
  const classes = [...p.book.content.classes.values()];
  return (
    <div className="cc-split">
      <div>
        <StepHead title="Class" hint="Your calling: what you do best in a fight and out of it." />
        <div className="cc-grid">
          {classes.map((cls) => (
            <OptionCard
              key={cls.id}
              title={cls.name}
              sub={`d${cls.hitDie} hit die · saves ${cls.saves.map((s) => s.toUpperCase()).join(', ')}`}
              on={cls.id === c.class}
              onClick={() => set(chooseClass(c, cls.id))}
            >
              {cls.spellcasting && <span className="cc-card-tag">Spellcaster</span>}
            </OptionCard>
          ))}
        </div>
      </div>
      {p.cls && p.options && <ClassDetail c={c} set={set} />}
    </div>
  );
}

function ClassDetail({ c, set }: Readonly<StepProps>) {
  const { cls, options } = partsOf(c);
  if (!cls || !options) return null;
  const features = cls.features.filter((f) => f.level <= c.level);
  const subclass = options.subclasses.find((s) => s.id === c.subclass);
  return (
    <aside className="cc-aside">
      <Detail title={cls.name}>
        <p className="cc-facts">
          Hit die d{cls.hitDie}. Saving throws: {cls.saves.map(abilityName).join(', ')}.
          {cls.spellcasting && ` Casts with ${abilityName(cls.spellcasting.ability)}.`}
        </p>
        <p className="cc-facts">
          Skills: pick {options.skills.pick} of {options.skills.from.map(skillName).join(', ')}.
        </p>
      </Detail>
      {c.level >= options.subclassLevel && options.subclasses.length > 0 && (
        <Detail title="Subclass">
          <Chips
            options={options.subclasses.map((s) => ({ id: s.id, label: s.name }))}
            value={c.subclass}
            onPick={(id) => set({ ...c, subclass: id })}
          />
          {subclass && <RichText text={subclass.description} className="rich small" />}
        </Detail>
      )}
      <Detail title={`Features to level ${c.level}`}>
        <TraitList traits={features.map((f) => ({ name: `${f.name} (${f.level})`, description: f.description }))} />
      </Detail>
    </aside>
  );
}

export function BackgroundStep({ c, set }: Readonly<StepProps>) {
  const p = partsOf(c);
  const bg = p.background;
  return (
    <div className="cc-split">
      <div>
        <StepHead title="Background" hint="Where you come from, and what you learned before adventuring." />
        <div className="cc-grid">
          {p.book.origins.backgrounds.map((b) => (
            <OptionCard
              key={b.id}
              title={b.name}
              sub={b.skills.map(skillName).join(', ')}
              on={b.id === c.background}
              onClick={() => set(chooseBackground(c, b.id))}
            />
          ))}
        </div>
        {c.rules === '2014' && (
          <p className="cc-note">The 2014 SRD has one background. Your GM can add more as homebrew.</p>
        )}
      </div>
      {bg && (
        <aside className="cc-aside">
          <Detail title={bg.name}>
            <p className="cc-facts">Skills: {bg.skills.map(skillName).join(', ')}.</p>
            {bg.abilities && <p className="cc-facts">Raises: {bg.abilities.map(abilityName).join(', ')}.</p>}
            <RichText text={bg.description} className="rich small" />
          </Detail>
          {bg.feat && (
            <Detail title={`Feat: ${bg.feat.name}`}>
              <RichText text={bg.feat.description} className="rich small" />
            </Detail>
          )}
        </aside>
      )}
    </div>
  );
}
