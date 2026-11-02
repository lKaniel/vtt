import { XIcon } from 'lucide-react';
import { classRows, type ClassRow, setClasses } from '../token-edit.ts';
import type { SheetProps } from './CharacterSheet.tsx';
import { Field, NumberInput, TextInput } from './EditorFields.tsx';
import { Button } from './kit/button.tsx';

// The creature's classes in the sheet's Details editor: one row per class
// with its levels, so a multiclassed character is "Fighter 3, Wizard 2".

export function ClassesEdit({ value, update }: Readonly<Pick<SheetProps, 'value' | 'update'>>) {
  const rows = classRows(value);
  const set = (next: ClassRow[]) => update((d) => setClasses(d, next));
  const change = (i: number, row: Partial<ClassRow>) => set(rows.map((r, j) => (j === i ? { ...r, ...row } : r)));
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r, i) => (
        <div key={i} className="ed-grid items-end">
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
        </div>
      ))}
      <Button variant="link" size="sm" className="self-start" onClick={() => set([...rows, { class: '', level: 1 }])}>
        {rows.length ? 'Add a class (multiclass)' : 'Add a class'}
      </Button>
    </div>
  );
}
