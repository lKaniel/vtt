import { type DamageType, type Edition, editionOf, type Skill, toEdition } from '@vtt/system-dnd5e';
import { cn } from '@/lib/utils';
import { gameContent } from '../../content/content.ts';
import { t } from '../../i18n/index.ts';
import type { MessageKey } from '../../i18n/en.ts';
import { cycleSkill, listText, parseList, setStat } from '../../play/token-edit.ts';
import { signed, skillRows } from '../../text/sheet-text.ts';
import { Field, TextInput } from '../EditorFields.tsx';
import { Badge } from '../kit/badge.tsx';
import { Button } from '../kit/button.tsx';
import { Input } from '../kit/input.tsx';
import { SelectField } from '../kit/select.tsx';
import { withKey } from '../sheet-model.ts';
import { ClassesEdit } from './ClassesEdit.tsx';
import { ProficiencyAdder, ProficiencyList } from '../creator/ProficiencyParts.tsx';
import { canAct, type SheetProps } from './sheet-props.ts';

// The Details tab: the 18 skills (click one to roll it), senses,
// proficiencies (click a tool to roll with it) and damage defences; in edit mode also which rules build the creature: its stat
// block, rules edition and classes.

export function DetailsTab(props: Readonly<SheetProps>) {
  return (
    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6">
      <Skills {...props} />
      <div className="flex flex-col gap-4">
        <Senses {...props} />
        <Proficiencies {...props} />
        <Defenses {...props} />
        {props.edit && <RulesFields {...props} />}
      </div>
    </div>
  );
}

function Heading({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <h4 className="m-0 mb-1 border-b border-gold-dim/70 pb-1 font-display text-sm tracking-wider text-gold">
      {children}
    </h4>
  );
}

function Skills(props: Readonly<SheetProps>) {
  const { session, value, update, sheet, edit } = props;
  const roll = canAct(props);
  const toggle = (skill: Skill) => update((d) => cycleSkill(d, skill), true);
  return (
    <section aria-label={t('sheet.skills')}>
      <Heading>{t('sheet.skills')}</Heading>
      <ul className="m-0 list-none p-0">
        {skillRows(value, sheet).map((r) => (
          <li key={r.skill} className="flex h-7 items-center gap-2 border-b border-white/5 text-sm">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-5 disabled:opacity-100"
              disabled={!edit}
              aria-label={t('sheet.toggleSkill', { skill: r.name })}
              aria-pressed={r.proficient}
              onClick={() => toggle(r.skill)}
            >
              <span
                title={r.expert ? t('sheet.expertise') : undefined}
                className={cn(
                  'size-2 rounded-full border border-gold',
                  r.proficient && 'bg-gold-bright',
                  r.expert && 'ring-2 ring-gold/60',
                )}
              />
            </Button>
            <span className="w-8 text-xs text-muted-foreground uppercase">{r.ability}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 flex-1 justify-between px-1.5 font-body text-sm text-foreground disabled:opacity-100"
              disabled={!roll}
              onClick={() => session.requests.rollCheck(value.id, { ability: r.ability, skill: r.skill })}
            >
              <span>{r.name}</span>
              <span className="font-display text-gold-bright">{signed(r.bonus)}</span>
            </Button>
            <span className="w-9 text-right text-xs text-muted-foreground" title={t('sheet.passive', { n: r.passive })}>
              {r.passive}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const SENSES = ['darkvision', 'blindsight', 'tremorsense', 'truesight', 'devilsSight'] as const;

function Senses({ sheet }: Readonly<SheetProps>) {
  const senses = SENSES.filter((s) => (sheet.senses?.[s] ?? 0) > 0);
  return (
    <section>
      <Heading>{t('sheet.senses')}</Heading>
      <div className="flex flex-wrap gap-1">
        {senses.length ? (
          senses.map((s) => (
            <Badge key={s} variant="muted">
              {t(`sheet.sense.${s}` as MessageKey)} {t('sheet.feet', { n: sheet.senses![s] })}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">{t('sheet.noSenses')}</span>
        )}
      </div>
    </section>
  );
}

/** Armor, weapons, tools (click one to roll a check with it) and languages; picked from a list in edit mode. */
function Proficiencies(props: Readonly<SheetProps>) {
  const { session, value, update, sheet, edit } = props;
  const stored = value.stats?.proficiencies ?? [];
  const shown = edit ? stored : (sheet.proficiencies ?? stored);
  if (!edit && !shown.length) return null;
  const content = gameContent(editionOf(value, session.world ?? {}));
  const save = (next: string[]) => update((d) => setStat(d, 'proficiencies', next.length ? next : undefined), true);
  const roll = canAct(props) && !edit;
  return (
    <section aria-label={t('sheet.proficiencies')}>
      <Heading>{t('sheet.proficiencies')}</Heading>
      <div className="flex flex-col gap-2">
        <ProficiencyList
          list={shown}
          content={content}
          onRemove={edit ? (id) => save(stored.filter((p) => p !== id)) : undefined}
          onRoll={
            roll ? (item) => session.requests.rollCheck(value.id, { ability: item.ability!, tool: item.id }) : undefined
          }
        />
        {edit && <ProficiencyAdder have={stored} content={content} onAdd={(id) => save([...stored, id])} />}
      </div>
    </section>
  );
}

const DEFENSES = ['resistances', 'immunities', 'vulnerabilities'] as const;

function Defenses({ value, update, sheet, edit }: Readonly<SheetProps>) {
  const shown = DEFENSES.filter((key) => edit || sheet[key].length > 0);
  if (!shown.length) return null;
  return (
    <section>
      <Heading>{t('sheet.defenses')}</Heading>
      <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
        {shown.map((key) => (
          <div key={key} className="contents">
            <dt className="text-muted-foreground">{t(`sheet.${key}`)}</dt>
            <dd className="m-0 flex flex-wrap gap-1">
              {edit ? (
                <Input
                  key={listText(value.stats?.[key])}
                  className="h-7 text-sm"
                  defaultValue={listText(value.stats?.[key])}
                  placeholder={listText(sheet[key]) || t('sheet.defensesHint')}
                  onBlur={(e) => update((d) => setStat(d, key, parseList(e.target.value)), true)}
                />
              ) : (
                sheet[key].map((type: DamageType) => (
                  <Badge key={type} variant="muted" className="capitalize">
                    {type}
                  </Badge>
                ))
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The stat block it uses: the GM's to choose (what creature it is). */
function MonsterField({ value, update, rules }: Readonly<Pick<SheetProps, 'value' | 'update'> & { rules: Edition }>) {
  return (
    <>
      <Field label="Monster stat block" wide>
        <TextInput
          value={value.monster}
          onChange={(v) => update((d) => withKey(d, 'monster', v))}
          list="sheet-monsters"
          placeholder="none: a character"
        />
      </Field>
      <datalist id="sheet-monsters">
        {[...gameContent(rules).monsters.values()].map((m) => (
          <option key={m.id} value={m.id} label={m.name} />
        ))}
      </datalist>
    </>
  );
}

function RulesFields({ session, value, update }: Readonly<SheetProps>) {
  const rules = editionOf(value, session.world ?? {});
  return (
    <section className="flex flex-col gap-2">
      <Heading>{t('sheet.rules')}</Heading>
      {session.isGm() && <MonsterField value={value} update={update} rules={rules} />}
      <Field label={t('sheet.rules')} wide>
        <SelectField
          value={value.stats?.rules ?? ''}
          onValueChange={(r) => update((d) => setStat(d, 'rules', r || undefined), true)}
          options={[
            { value: '', label: `World (${toEdition(session.world?.rules)})` },
            { value: '2014', label: '2014 (SRD 5.1)' },
            { value: '2024', label: '2024 (SRD 5.2)' },
          ]}
        />
      </Field>
      <ClassesEdit value={value} update={update} rules={rules} />
    </section>
  );
}
