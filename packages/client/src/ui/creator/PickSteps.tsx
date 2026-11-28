import {
  abilityMod,
  abilityName,
  abilityScores,
  characterSkills,
  partsOf,
  proficiencyForLevel,
  type Skill,
  skillName,
  SKILLS,
  type Spell,
} from '@vtt/system-dnd5e';
import { useState } from 'react';
import { spellChoices, toggleSkill, toggleSpell } from '../../content/creator.ts';
import { spellIcon } from '../../icons.ts';
import { spellArt } from '../../icon-art.ts';
import { ORDINAL } from '../../text/spell-text.ts';
import { IconFace } from '../Icon.tsx';
import type { StepProps } from './OriginSteps.tsx';
import { Detail, RichText, StepHead } from './Parts.tsx';
import { CustomProficiencies } from './CustomSteps.tsx';
import { ProficiencySection } from './ProficiencyStep.tsx';
import { t } from '../../i18n/index.ts';
import { Pressable } from '../kit/pressable.tsx';

function skillSource(fixed: boolean, offered: boolean): string {
  if (fixed) return t('skills.fromBackground');
  return offered ? t('skills.fromClass') : t('skills.notClass');
}

export function SkillsStep({ c, set }: Readonly<StepProps>) {
  const p = partsOf(c);
  const fromBackground = p.background?.skills ?? [];
  const { pick, from } = p.options?.skills ?? { pick: 0, from: [] };
  const scores = abilityScores(c);
  const prof = proficiencyForLevel(c.level);
  const known = characterSkills(c);
  const expert = (s: string) => c.expertise.includes(s);
  const names = fromBackground.map(skillName).join(t('skills.and'));
  const given = fromBackground.length ? `${t('skills.given', { names })} ` : '';
  return (
    <div className="cc-split">
      <div>
        <StepHead
          title={t('skills.title')}
          hint={`${given}${t('skills.pick', { n: pick })}`}
          right={<span className="cc-counter">{t('skills.left', { n: pick - c.skills.length })}</span>}
        />
        <div className="cc-skills">
          {(Object.keys(SKILLS) as Skill[]).map((s) => {
            const fixed = fromBackground.includes(s);
            const offered = from.includes(s) && !fixed;
            const bonus = abilityMod(scores[SKILLS[s]]) + (known.includes(s) ? prof : 0) * (expert(s) ? 2 : 1);
            return (
              <Pressable
                key={s}
                className={`cc-skill${known.includes(s) ? ' on' : ''}${fixed ? ' given' : ''}`}
                disabled={!offered}
                onClick={() => set(toggleSkill(c, s))}
                title={skillSource(fixed, offered)}
              >
                <span className="cc-skill-name">{skillName(s)}</span>
                <span className="cc-skill-ability">{abilityName(SKILLS[s]).slice(0, 3)}</span>
                <span className="cc-skill-bonus">{bonus >= 0 ? `+${bonus}` : bonus}</span>
              </Pressable>
            );
          })}
        </div>
        <ProficiencySection c={c} set={set} />
      </div>
      <aside className="cc-aside">
        <CustomProficiencies c={c} set={set} />
      </aside>
    </div>
  );
}

/** Picks cantrips and spells for the character at `level`; the creator and level up share it. */
export function SpellPicker({
  c,
  set,
  level = c.level,
  classId = c.class,
}: Readonly<StepProps & { level?: number; classId?: string }>) {
  const { limits, cantrips, spells } = spellChoices(c, level, classId);
  const [focus, setFocus] = useState<Spell>();
  const count = (list: Spell[]) => c.spells.filter((id) => list.some((s) => s.id === id)).length;
  const verb = c.rules === '2014' && classId === 'wizard' ? t('spells.inBook') : t('spells.known');
  const grid = { c, set, level, classId, onFocus: setFocus };
  return (
    <div className="cc-split">
      <div>
        <StepHead
          title={t('spells.title')}
          hint={t('spells.hint', { level: ORDINAL[limits.maxLevel] ?? limits.maxLevel, verb })}
          right={
            <span className="cc-counter">
              {t('spells.counter', {
                cantrips: count(cantrips),
                maxCantrips: limits.cantrips,
                spells: count(spells),
                maxSpells: limits.spells,
              })}
            </span>
          }
        />
        {limits.cantrips > 0 && <SpellGrid title={t('spells.cantrips')} list={cantrips} {...grid} />}
        <SpellGrid title={t('spells.title')} list={spells} {...grid} />
      </div>
      <aside className="cc-aside">
        {focus ? (
          <Detail title={focus.name}>
            <p className="cc-facts">
              {focus.level ? t('spells.level', { level: ORDINAL[focus.level] ?? focus.level }) : t('spells.cantrip')}{' '}
              {focus.school} · {focus.castingTime} ·{' '}
              {focus.range ? t('summary.feet', { n: focus.range }) : t('spells.self')} · {focus.duration}
            </p>
            <RichText text={focus.description} className="rich small" />
          </Detail>
        ) : (
          <p className="cc-note">{t('spells.point')}</p>
        )}
      </aside>
    </div>
  );
}

function SpellGrid({
  title,
  list,
  c,
  set,
  level,
  classId,
  onFocus,
}: Readonly<
  StepProps & { title: string; list: Spell[]; level: number; classId: string; onFocus: (s: Spell) => void }
>) {
  return (
    <section className="cc-spells">
      <h3>{title}</h3>
      <div className="cc-spell-grid">
        {list.map((s) => (
          <Pressable
            key={s.id}
            className={c.spells.includes(s.id) ? 'cc-spell on' : 'cc-spell'}
            onClick={() => set(toggleSpell(c, s.id, level, classId))}
            onMouseEnter={() => onFocus(s)}
            onFocus={() => onFocus(s)}
          >
            <IconFace icon={{ ...spellIcon(s), art: spellArt(s) }} size={20} />
            <span>{s.name}</span>
            {s.level > 0 && <span className="cc-spell-level">{s.level}</span>}
          </Pressable>
        ))}
      </div>
    </section>
  );
}
