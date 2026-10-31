import type { ReactNode } from 'react';
import { numberOrUndefined } from '../token-edit.ts';

// Small form controls for the GM's token editor, styled to match the sheet.

export function Field({ label, children, wide }: Readonly<{ label: string; children: ReactNode; wide?: boolean }>) {
  return (
    <label className={wide ? 'ed-field wide' : 'ed-field'}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  list,
}: Readonly<{
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  list?: string;
}>) {
  return (
    <input
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      list={list}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
    />
  );
}

/** A number field; empty means "use the default", shown as the placeholder. */
export function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  className,
}: Readonly<{
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string | number;
  min?: number;
  className?: string;
}>) {
  return (
    <input
      type="number"
      className={className}
      value={value ?? ''}
      min={min}
      placeholder={placeholder === undefined ? '' : String(placeholder)}
      onChange={(e) => onChange(numberOrUndefined(e.target.value))}
    />
  );
}

export function Check({
  label,
  checked,
  onChange,
}: Readonly<{ label: string; checked: boolean; onChange: (v: boolean) => void }>) {
  return (
    <label className="ed-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
