import { choicesDue, type Class, type Edition, findClass } from '@vtt/system-dnd5e';
import { XIcon } from 'lucide-react';
import { gameContent } from '../../content/content.ts';
import { classRows, type ClassRow, setClasses, toggleFeature } from '../../play/token-edit.ts';
import type { SheetProps } from './sheet-props.ts';
import { Field, NumberInput, TextInput } from '../EditorFields.tsx';
import { Button } from '../kit/button.tsx';
import { SelectField } from '../kit/select.tsx';
import { Toggle } from '../kit/toggle.tsx';
import { t } from '../../i18n/index.ts';

// The creature's classes in the sheet's Details editor: one row per class
// with its levels, so a multiclassed character is "Fighter 3, Wizard 2";
// a class with subclasses (homebrew) picks one, and its options are ticked.

type Props = Readonly<Pick<SheetProps, 'value' | 'update'> & { rules: Edition }>;

export function ClassesEdit({ value, update, rules }: Props) {
  const rows = classRows(value);
  const set = (next: ClassRow[]) => update((d) => setClasses(d, next));
  const change = (i: number, row: Partial<ClassRow>) => set(rows.map((r, j) => (j === i ? { ...r, ...row } : r)));
  const content = gameContent(rules);
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r, i) => {
        const cls = findClass(r.class, content);
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="ed-grid items-end">
              <Field label={i ? t('classes.multiclass') : t('classes.class')}>
                <TextInput
                  value={r.class}
                  onChange={(c) => change(i, { class: c ?? '' })}
                  placeholder={t('classes.none')}
                />
              </Field>
              <Field label={t('classes.level')}>
                <div className="flex items-center gap-1">
                  <NumberInput value={r.level} min={1} onChange={(l) => change(i, { level: l ?? 1 })} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('classes.remove')}
                    title={t('classes.remove')}
                    onClick={() => set(rows.filter((_, j) => j !== i))}
                  >
                    <XIcon />
                  </Button>
                </div>
              </Field>
              {cls?.subclasses?.length ? (
                <SubclassField cls={cls} value={r.subclass} onChange={(subclass) => change(i, { subclass })} />
              ) : null}
            </div>
            {cls && <ClassOptions cls={cls} level={r.level} subclass={r.subclass} value={value} update={update} />}
          </div>
        );
      })}
      <Button variant="link" size="sm" className="self-start" onClick={() => set([...rows, { class: '', level: 1 }])}>
        {rows.length ? t('classes.addMulti') : t('classes.add')}
      </Button>
    </div>
  );
}

function SubclassField({
  cls,
  value,
  onChange,
}: Readonly<{ cls: Class; value?: string; onChange: (subclass: string | undefined) => void }>) {
  const options = [
    { value: '', label: t('classes.noSubclass') },
    ...(cls.subclasses ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];
  return (
    <Field label={t('classes.subclass')}>
      <SelectField
        value={value ?? ''}
        onValueChange={(s) => onChange(s || undefined)}
        options={options}
        aria-label={t('classes.subclass')}
      />
    </Field>
  );
}

/** The class's choices at its level: each option a toggle, picked ones in `stats.features`. */
function ClassOptions({
  cls,
  level,
  subclass,
  value,
  update,
}: Readonly<{ cls: Class; level: number; subclass?: string } & Pick<SheetProps, 'value' | 'update'>>) {
  const due = choicesDue(cls, level, value.stats?.features ?? [], subclass);
  return due.map((c) => (
    <div key={c.id} className="flex flex-wrap items-center gap-1" data-slot="class-options">
      <span className="text-sm text-muted-foreground">
        {t('classes.picked', { name: c.name, picked: c.picked.length, count: c.count })}
      </span>
      {c.options.map((o) => (
        <Toggle
          key={o.id}
          pressed={c.picked.includes(o.id)}
          disabled={!c.picked.includes(o.id) && c.picked.length >= c.count}
          onPressedChange={() => update((d) => toggleFeature(d, `${cls.id}/${o.id}`))}
        >
          {o.name}
        </Toggle>
      ))}
    </div>
  ));
}
