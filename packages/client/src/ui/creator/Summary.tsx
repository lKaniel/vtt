import {
  ABILITIES,
  abilityMod,
  abilityScores,
  type Character,
  characterMaxHp,
  characterSkills,
  partsOf,
  skillName,
} from '@vtt/system-dnd5e';
import { characterSummary } from '../../content/creator.ts';
import { StepHead } from './Parts.tsx';
import type { StepProps } from './OriginSteps.tsx';
import { Input } from '../kit/input.tsx';
import { t } from '../../i18n/index.ts';

const SWATCHES = ['#c0603a', '#5a9be0', '#5ac08a', '#b48cff', '#e0b040', '#d0d0d0', '#9b3b5a', '#3aa6a0'];

export function IdentityStep({ c, set }: Readonly<StepProps>) {
  return (
    <div className="cc-identity">
      <StepHead title={t('identity.title')} hint={t('identity.hint')} />
      <label className="auth-field">
        <span>{t('identity.name')}</span>
        <Input value={c.name} maxLength={40} onChange={(e) => set({ ...c, name: e.target.value })} />
      </label>
      <div className="auth-field">
        <span>{t('identity.colour')}</span>
        <div className="cc-swatches">
          {SWATCHES.map((s) => (
            <button
              key={s}
              className={s === c.color ? 'cc-swatch on' : 'cc-swatch'}
              style={{ background: s }}
              aria-label={t('identity.swatch', { colour: s })}
              onClick={() => set({ ...c, color: s })}
            />
          ))}
        </div>
      </div>
      <label className="auth-field">
        <span>{t('identity.portrait')}</span>
        <Input
          value={c.img ?? ''}
          placeholder={t('identity.portraitHint')}
          onChange={(e) => set({ ...c, img: e.target.value.trim() || undefined })}
        />
      </label>
    </div>
  );
}

/** The live character sheet beside every step. */
export function Summary({ c }: Readonly<{ c: Character }>) {
  const p = partsOf(c);
  const scores = abilityScores(c, p);
  const darkvision = Math.max(p.species?.darkvision ?? 0, p.subspecies?.darkvision ?? 0);
  return (
    <aside className="cc-summary frame">
      <div className="cc-portrait" style={{ backgroundImage: `url(${c.img ?? '/art/ui/portrait-default.webp'})` }} />
      <h2 className="cc-name" style={{ color: c.color }}>
        {c.name || t('identity.unnamed')}
      </h2>
      <p className="cc-line">{characterSummary(c)}</p>
      <div className="cc-scores">
        {ABILITIES.map((a) => (
          <div key={a} className="cc-score">
            <span className="cc-score-name">{a.toUpperCase()}</span>
            <span className="cc-score-value">{scores[a]}</span>
            <span className="cc-score-mod">
              {abilityMod(scores[a]) >= 0 ? `+${abilityMod(scores[a])}` : abilityMod(scores[a])}
            </span>
          </div>
        ))}
      </div>
      <dl className="cc-vitals">
        <dt>{t('summary.hp')}</dt>
        <dd>{characterMaxHp(c, p)}</dd>
        <dt>{t('summary.speed')}</dt>
        <dd>{t('summary.feet', { n: p.species?.speed ?? 30 })}</dd>
        {darkvision > 0 && (
          <>
            <dt>{t('summary.darkvision')}</dt>
            <dd>{t('summary.feet', { n: darkvision })}</dd>
          </>
        )}
        <dt>{t('summary.rules')}</dt>
        <dd>{c.rules}</dd>
      </dl>
      <p className="cc-skill-list">{characterSkills(c, p).map(skillName).join(', ')}</p>
    </aside>
  );
}

export type { StepProps };
