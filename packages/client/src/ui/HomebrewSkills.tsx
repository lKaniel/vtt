import type { Doc } from '@vtt/core';
import { slugify } from '@vtt/core';
import { ABILITIES, abilityName } from '@vtt/system-dnd5e';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { SelectField } from './kit/select.tsx';

// The game's own skills (Psychic Resistance, Wisdom), in the Compendium's
// Homebrew: each is a homebrew document of kind "skill", shared so every
// sheet in the game lists it after the 18 skills. Its ability is the
// default: each character may pick another, or a typed bonus.

const ABILITY_OPTIONS = [
  ...ABILITIES.map((a) => ({ value: a, label: abilityName(a) })),
  { value: 'none', label: t('sheet.typedBonus') },
];
const nameOf = (doc: Doc) => (typeof doc.name === 'string' ? doc.name : doc.id);
const abilityOf = (doc: Doc) => (typeof doc.ability === 'string' ? doc.ability : 'wis');

export function HomebrewSkills({ session }: Readonly<{ session: Session }>) {
  const [name, setName] = useState('');
  const [ability, setAbility] = useState('wis');
  const docs = session.docs.all('homebrew').filter((d) => d.kind === 'skill');
  const id = slugify(name);
  const free = !!id && !session.docs.get('homebrew', id);
  const create = () => {
    if (!free) return;
    session.journal.createHomebrew({
      id,
      kind: 'skill',
      name: name.trim(),
      ability,
      ownership: { default: 'observer' },
    });
    setName('');
  };
  return (
    <section className="flex flex-col gap-2" aria-label={t('compendium.skills')} data-slot="homebrew-skills">
      <h4 className="m-0 font-display text-sm tracking-wider text-gold">{t('compendium.skills')}</h4>
      <div className="flex gap-1">
        <Input
          value={name}
          placeholder={t('compendium.skillName')}
          aria-label={t('compendium.skillName')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <SelectField
          value={ability}
          onValueChange={setAbility}
          options={ABILITY_OPTIONS}
          aria-label={t('compendium.skillAbility')}
        />
        <Button variant="outline" size="sm" disabled={!free} onClick={create}>
          {t('compendium.newSkill')}
        </Button>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {docs.map((doc) => (
          <SkillRow key={doc.id} session={session} doc={doc} />
        ))}
      </ul>
      {!docs.length && <p className="muted">{t('compendium.noSkills')}</p>}
    </section>
  );
}

function SkillRow({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const name = nameOf(doc);
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="flex-1">{name}</span>
      <SelectField
        value={abilityOf(doc)}
        onValueChange={(a) => session.journal.patchEntry('homebrew', doc.id, { ability: a })}
        options={ABILITY_OPTIONS}
        aria-label={t('compendium.skillAbilityOf', { name })}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('compendium.deleteSkill', { name })}
        onClick={() => session.journal.deleteEntry('homebrew', doc.id)}
      >
        <Trash2 />
      </Button>
    </li>
  );
}
