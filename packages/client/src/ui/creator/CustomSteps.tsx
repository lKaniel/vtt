import {
  abilityName,
  ABILITIES,
  characterProficiencies,
  characterSkills,
  partsOf,
  type Skill,
  SKILLS,
  skillName,
} from '@vtt/system-dnd5e';
import { XIcon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import {
  editCustomBackground,
  editCustomSpecies,
  NEW_SPECIES,
  newBackground,
  addProficiency,
  removeProficiency,
  toggleBackgroundAbility,
  toggleBackgroundSkill,
  toggleExpertise,
  toggleExtraSkill,
} from '../../content/creator-custom.ts';
import { t } from '../../i18n/index.ts';
import { Button } from '../kit/button.tsx';
import { Input } from '../kit/input.tsx';
import { Label } from '../kit/label.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { Textarea } from '../kit/textarea.tsx';
import { Toggle } from '../kit/toggle.tsx';
import type { StepProps } from './OriginSteps.tsx';
import { Chips, Detail } from './Parts.tsx';
import { ProficiencyAdder, ProficiencyList } from './ProficiencyParts.tsx';

// The forms for the creator's Custom options: a species and a background
// the player describes, and proficiencies on top of the usual ones.

const ALL_SKILLS = Object.keys(SKILLS) as Skill[];

function Field({ label, children }: Readonly<{ label: string; children: (id: string) => ReactNode }>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

/** Toggles for a list of ids; `on` says which are picked, `off` which can't be. */
function ToggleRow<T extends string>(
  props: Readonly<{ ids: readonly T[]; name: (id: T) => string; on: (id: T) => boolean; flip: (id: T) => void }>,
) {
  return (
    <div className="cc-chips">
      {props.ids.map((id) => (
        <Toggle key={id} pressed={props.on(id)} onPressedChange={() => props.flip(id)}>
          {props.name(id)}
        </Toggle>
      ))}
    </div>
  );
}

const DARKVISION = ['0', '60', '120'] as const;

export function CustomSpeciesForm({ c, set }: Readonly<StepProps>) {
  const s = c.customSpecies ?? NEW_SPECIES;
  const edit = (patch: Partial<typeof s>) => set(editCustomSpecies(c, patch));
  return (
    <Detail title={t(c.rules === '2014' ? 'creator.customRace' : 'creator.customSpecies')}>
      <Field label={t('creator.name')}>
        {(id) => <Input id={id} value={s.name} maxLength={40} onChange={(e) => edit({ name: e.target.value })} />}
      </Field>
      <p className="cc-label">{t('creator.size')}</p>
      <Chips
        options={[
          { id: 'small' as const, label: t('creator.small') },
          { id: 'medium' as const, label: t('creator.medium') },
        ]}
        value={s.size}
        onPick={(size) => edit({ size })}
      />
      <Field label={t('creator.speed')}>
        {(id) => (
          <NumberField id={id} value={s.speed} min={20} max={40} step={5} onValueChange={(speed) => edit({ speed })} />
        )}
      </Field>
      <p className="cc-label">{t('creator.darkvision')}</p>
      <Chips
        options={DARKVISION.map((d) => ({ id: d, label: d === '0' ? t('creator.none') : t('creator.feet', { n: d }) }))}
        value={String(s.darkvision) as (typeof DARKVISION)[number]}
        onPick={(d) => edit({ darkvision: Number(d) })}
      />
      {c.rules === '2014' && <p className="cc-facts">{t('creator.freeBonus')}</p>}
      <TraitsEditor traits={s.traits} onChange={(traits) => edit({ traits })} />
    </Detail>
  );
}

interface Trait {
  name: string;
  description: string;
}

function TraitsEditor({ traits, onChange }: Readonly<{ traits: Trait[]; onChange: (t: Trait[]) => void }>) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const add = () => {
    if (!name.trim()) return;
    onChange([...traits, { name: name.trim(), description: text.trim() }]);
    setName('');
    setText('');
  };
  return (
    <>
      <p className="cc-label">{t('creator.traits')}</p>
      {traits.map((tr, i) => (
        <div key={`${tr.name}-${i}`} className="flex items-start gap-2">
          <p className="cc-facts flex-1">
            <strong>{tr.name}.</strong> {tr.description}
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('creator.removeTrait', { name: tr.name })}
            onClick={() => onChange(traits.filter((_, j) => j !== i))}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Input
        placeholder={t('creator.traitName')}
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
      />
      <Textarea placeholder={t('creator.traitText')} value={text} onChange={(e) => setText(e.target.value)} />
      <Button variant="outline" size="sm" disabled={!name.trim()} onClick={add}>
        {t('creator.addTrait')}
      </Button>
    </>
  );
}

export function CustomBackgroundForm({ c, set }: Readonly<StepProps>) {
  const b = c.customBackground ?? newBackground(c);
  const edit = (patch: Partial<typeof b>) => set(editCustomBackground(c, patch));
  return (
    <Detail title={t('creator.customBackground')}>
      <Field label={t('creator.name')}>
        {(id) => <Input id={id} value={b.name} maxLength={40} onChange={(e) => edit({ name: e.target.value })} />}
      </Field>
      <p className="cc-label">{t('creator.bgSkills', { picked: b.skills.length })}</p>
      <ToggleRow
        ids={ALL_SKILLS}
        name={skillName}
        on={(s) => b.skills.includes(s)}
        flip={(s) => set(toggleBackgroundSkill(c, s))}
      />
      {c.rules === '2024' && <BackgroundOrigin c={c} set={set} />}
    </Detail>
  );
}

/** 2024: the abilities a custom background raises and its origin feat. */
function BackgroundOrigin({ c, set }: Readonly<StepProps>) {
  const b = c.customBackground ?? newBackground(c);
  const feat = b.feat ?? { name: '', description: '' };
  const editFeat = (patch: Partial<Trait>) => {
    const next = { ...feat, ...patch };
    set(editCustomBackground(c, { feat: next.name.trim() ? next : undefined }));
  };
  return (
    <>
      <p className="cc-label">{t('creator.bgAbilities', { picked: b.abilities?.length ?? 0 })}</p>
      <ToggleRow
        ids={ABILITIES}
        name={abilityName}
        on={(a) => !!b.abilities?.includes(a)}
        flip={(a) => set(toggleBackgroundAbility(c, a))}
      />
      <Field label={t('creator.feat')}>
        {(id) => (
          <Input
            id={id}
            placeholder={t('creator.featName')}
            value={feat.name}
            maxLength={60}
            onChange={(e) => editFeat({ name: e.target.value })}
          />
        )}
      </Field>
      <Textarea
        placeholder={t('creator.featText')}
        value={feat.description}
        disabled={!feat.name.trim()}
        onChange={(e) => editFeat({ description: e.target.value })}
      />
    </>
  );
}

/** Extra skills, expertise and other proficiencies, for whatever the GM allows. */
export function CustomProficiencies({ c, set }: Readonly<StepProps>) {
  const known = characterSkills(c);
  const usual = new Set(characterSkills({ ...c, extraSkills: [] }));
  return (
    <Detail title={t('creator.customProf')}>
      <p className="cc-facts">{t('creator.customProfHint')}</p>
      <p className="cc-label">{t('creator.extraSkills')}</p>
      <ToggleRow
        ids={ALL_SKILLS.filter((s) => !usual.has(s))}
        name={skillName}
        on={(s) => c.extraSkills.includes(s)}
        flip={(s) => set(toggleExtraSkill(c, s))}
      />
      <p className="cc-label">{t('creator.expertise')}</p>
      <p className="cc-facts">{t('creator.expertiseHint')}</p>
      <ToggleRow
        ids={ALL_SKILLS.filter((s) => known.includes(s))}
        name={skillName}
        on={(s) => c.expertise.includes(s)}
        flip={(s) => set(toggleExpertise(c, s))}
      />
      <OtherProficiencies c={c} set={set} />
    </Detail>
  );
}

/** Armor, weapons, tools and languages beyond the given ones, picked from the list. */
function OtherProficiencies({ c, set }: Readonly<StepProps>) {
  const parts = partsOf(c);
  return (
    <Field label={t('creator.extraProf')}>
      {(id) => (
        <>
          <p className="cc-facts">{t('creator.otherHint')}</p>
          <ProficiencyAdder
            id={id}
            have={characterProficiencies(c, parts)}
            content={parts.book.content}
            onAdd={(p) => set(addProficiency(c, p))}
          />
          <ProficiencyList
            list={c.proficiencies}
            content={parts.book.content}
            onRemove={(p) => set(removeProficiency(c, p))}
          />
        </>
      )}
    </Field>
  );
}
