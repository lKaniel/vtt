import { type ReactNode, useState } from 'react';
import { Input } from '../kit/input.tsx';
import { Label } from '../kit/label.tsx';

/** What useChecked needs of a schema (zod's safeParse), without the client importing zod. */
export interface Checks<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } };
}

/** A labelled field in an editor's grid; `wide` spans both columns. */
export function Field({ label, wide, children }: Readonly<{ label: string; wide?: boolean; children: ReactNode }>) {
  return (
    <Label className={`flex-col items-stretch gap-1 ${wide ? 'col-span-2' : ''}`}>
      {label}
      {children}
    </Label>
  );
}

/** Options for a SelectField from plain values. */
export const choices = (values: readonly string[], label = (v: string) => v[0]!.toUpperCase() + v.slice(1)) =>
  values.map((value) => ({ value, label: label(value) }));

/**
 * An editor's working copy: changes show at once, and reach `onSave` only
 * when `schema` accepts them (a half-typed name is kept here, not saved).
 */
export function useChecked<T>(start: T, schema: Checks<T>, onSave: (value: T) => void) {
  const [draft, setDraft] = useState(start);
  const [problem, setProblem] = useState<string>();
  const change = (patch: Partial<T>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    const parsed = schema.safeParse(next);
    setProblem(parsed.success ? undefined : parsed.error.issues[0]?.message);
    if (parsed.success) onSave(parsed.data);
  };
  return { draft, change, replace: (next: T) => change(next), problem };
}

/** Why the last change wasn't saved, under the fields. */
export function Problem({ text }: Readonly<{ text?: string }>) {
  return text ? <p className="text-xs text-[#e2766e]">Not saved yet: {text}</p> : null;
}

/** The name, across the top of every editor. */
export function NameField({ name, onChange }: Readonly<{ name: string; onChange: (name: string) => void }>) {
  return (
    <Field label="Name" wide>
      <Input value={name} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
