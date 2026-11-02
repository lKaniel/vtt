import { type Class, type Edition, findClass } from '@vtt/system-dnd5e';
import { XIcon } from 'lucide-react';
import { gameContent } from '../content/content.ts';
import { choicesDue } from '../content/homebrew-edit.ts';
import { classRows, type ClassRow, setClasses, toggleFeature } from '../play/token-edit.ts';
import type { SheetProps } from './CharacterSheet.tsx';
import { Field, NumberInput, TextInput } from './EditorFields.tsx';
import { Button } from './kit/button.tsx';
import { SelectField } from './kit/select.tsx';
import { Toggle } from './kit/toggle.tsx';

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
              <Field label={i ? 'Multiclass' : 'Class'}>
                <TextInput value={r.class} onChange={(c) => change(i, { class: c ?? '' })} placeholder="none" />
              </Field>
              <Field label="Level">
                <div className="flex items-center gap-1">
                  <NumberInput value={r.level} min={1} onChange={(l) => change(i, { level: l ?? 1 })} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove class"
                    title="Remove class"
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
            {cls && <ClassOptions cls={cls} level={r.level} value={value} update={update} />}
          </div>
        );
      })}
      <Button variant="link" size="sm" className="self-start" onClick={() => set([...rows, { class: '', level: 1 }])}>
        {rows.length ? 'Add a class (multiclass)' : 'Add a class'}
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
    { value: '', label: 'None' },
    ...(cls.subclasses ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];
  return (
    <Field label="Subclass">
      <SelectField
        value={value ?? ''}
        onValueChange={(s) => onChange(s || undefined)}
        options={options}
        aria-label="Subclass"
      />
    </Field>
  );
}

/** The class's choices at its level: each option a toggle, picked ones in `stats.features`. */
function ClassOptions({
  cls,
  level,
  value,
  update,
}: Readonly<{ cls: Class; level: number } & Pick<SheetProps, 'value' | 'update'>>) {
  const due = choicesDue(cls, level, value.stats?.features ?? []);
  return due.map((c) => (
    <div key={c.id} className="flex flex-wrap items-center gap-1" data-slot="class-options">
      <span className="text-sm text-muted-foreground">
        {c.name} ({c.picked.length} of {c.count})
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
