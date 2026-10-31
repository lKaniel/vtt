import {
  abilityMod,
  abilityName,
  abilityScores,
  characterSkills,
  partsOf,
  proficiencyForLevel,
  SKILLS,
  skillName,
  type Skill,
  type Spell,
} from '@vtt/shared';
import { useState } from 'react';
import { spellChoices, toggleSkill, toggleSpell } from '../../creator.ts';
import { spellIcon } from '../../icons.ts';
import { spellArt } from '../../icon-art.ts';
import { ORDINAL } from '../../spell-text.ts';
import { IconFace } from '../Icon.tsx';
import type { StepProps } from './OriginSteps.tsx';
import { Detail, RichText, StepHead } from './Parts.tsx';

function skillSource(fixed: boolean, offered: boolean): string {
  if (fixed) return 'From your background';
  return offered ? 'From your class list' : 'Not on your class list';
}

export function SkillsStep({ c, set }: Readonly<StepProps>) {
  const p = partsOf(c);
  const fromBackground = p.background?.skills ?? [];
  const { pick, from } = p.options?.skills ?? { pick: 0, from: [] };
  const scores = abilityScores(c);
  const prof = proficiencyForLevel(c.level);
  const known = characterSkills(c);
  return (
    <div>
      <StepHead
        title="Skills"
        hint={`Your background gives ${fromBackground.map(skillName).join(' and ')}. Pick ${pick} from your class list.`}
        right={<span className="cc-counter">{pick - c.skills.length} left</span>}
      />
      <div className="cc-skills">
        {(Object.keys(SKILLS) as Skill[]).map((s) => {
          const fixed = fromBackground.includes(s);
          const offered = from.includes(s) && !fixed;
          const bonus = abilityMod(scores[SKILLS[s]]) + (known.includes(s) ? prof : 0);
          return (
            <button
              key={s}
              className={`cc-skill${known.includes(s) ? ' on' : ''}${fixed ? ' fixed' : ''}`}
              disabled={!offered}
              onClick={() => set(toggleSkill(c, s))}
              title={skillSource(fixed, offered)}
            >
              <span className="cc-skill-name">{skillName(s)}</span>
              <span className="cc-skill-ability">{abilityName(SKILLS[s]).slice(0, 3)}</span>
              <span className="cc-skill-bonus">{bonus >= 0 ? `+${bonus}` : bonus}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Picks cantrips and spells for the character at `level`; the creator and level up share it. */
export function SpellPicker({ c, set, level = c.level }: Readonly<StepProps & { level?: number }>) {
  const { limits, cantrips, spells } = spellChoices(c, level);
  const [focus, setFocus] = useState<Spell>();
  const count = (list: Spell[]) => c.spells.filter((id) => list.some((s) => s.id === id)).length;
  const verb = c.rules === '2014' && c.class === 'wizard' ? 'in your spellbook' : 'known or prepared';
  return (
    <div className="cc-split">
      <div>
        <StepHead
          title="Spells"
          hint={`Spells up to ${ORDINAL[limits.maxLevel]} level, ${verb}.`}
          right={
            <span className="cc-counter">
              Cantrips {count(cantrips)}/{limits.cantrips} · Spells {count(spells)}/{limits.spells}
            </span>
          }
        />
        {limits.cantrips > 0 && (
          <SpellGrid title="Cantrips" list={cantrips} c={c} set={set} level={level} onFocus={setFocus} />
        )}
        <SpellGrid title="Spells" list={spells} c={c} set={set} level={level} onFocus={setFocus} />
      </div>
      <aside className="cc-aside">
        {focus ? (
          <Detail title={focus.name}>
            <p className="cc-facts">
              {focus.level ? `${ORDINAL[focus.level]} level` : 'Cantrip'} {focus.school} · {focus.castingTime} ·{' '}
              {focus.range ? `${focus.range} ft` : 'self'} · {focus.duration}
            </p>
            <RichText text={focus.description} className="rich small" />
          </Detail>
        ) : (
          <p className="cc-note">Point at a spell to read it.</p>
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
  onFocus,
}: Readonly<StepProps & { title: string; list: Spell[]; level: number; onFocus: (s: Spell) => void }>) {
  return (
    <section className="cc-spells">
      <h3>{title}</h3>
      <div className="cc-spell-grid">
        {list.map((s) => (
          <button
            key={s.id}
            className={c.spells.includes(s.id) ? 'cc-spell on' : 'cc-spell'}
            onClick={() => set(toggleSpell(c, s.id, level))}
            onMouseEnter={() => onFocus(s)}
            onFocus={() => onFocus(s)}
          >
            <IconFace icon={{ ...spellIcon(s), art: spellArt(s) }} size={20} />
            <span>{s.name}</span>
            {s.level > 0 && <span className="cc-spell-level">{s.level}</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
