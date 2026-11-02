import { useState } from 'react';
import { commonValue, fieldsFor, MIXED, type Field, type FieldValue } from '../editor/inspector.ts';
import type { Session } from '../session.ts';
import { Input } from './kit/input.tsx';
import { Checkbox } from './kit/checkbox.tsx';
import { SelectField } from './kit/select.tsx';

/** Fields only the GM sets. */
const GM_FIELDS = new Set(['hidden', 'level']);

/** A field whose options come from the game: its journal entries, or the scene's levels. */
function withChoices(field: Field, session: Session): Field {
  if (field.choices === 'journals') {
    const entries = session.docs
      .all('journals')
      .map((j) => ({ value: j.id, label: typeof j.name === 'string' ? j.name : j.id }));
    return { ...field, options: [{ value: '', label: 'none' }, ...entries] };
  }
  if (field.choices === 'tiles') {
    const tiles = session.docs
      .all(`${session.scene}/tiles`)
      .filter((t) => t.kind !== 'group' && t.background !== true)
      .map((t) => ({ value: t.id, label: typeof t.name === 'string' ? t.name : t.id }));
    return { ...field, options: [{ value: '', label: 'none' }, ...tiles] };
  }
  if (field.choices === 'levels') {
    const levels = (session.world?.levels ?? []).map((l) => ({ value: l.id, label: l.name }));
    return { ...field, options: [{ value: '', label: 'every level' }, ...levels] };
  }
  return field;
}

/** The panel of the selection's fields (the GM's, or a player's own drawings); a change is one undo step for the whole selection. */
export function Inspector({ session }: Readonly<{ session: Session }>) {
  if (!session.selection.length || !session.canEditSelection()) return null;
  const docs = session.selectedDocs().map((d) => d.doc);
  const fields = fieldsFor(docs)
    .filter((f) => session.isGm() || !GM_FIELDS.has(f.key))
    .map((f) => withChoices(f, session));
  const count = session.selection.length;
  return (
    <div className="inspector frame" aria-label="Inspector">
      <div className="inspector-head">
        {count === 1 ? (docs[0]?.id ?? '') : `${count} selected`}
        <span className="inspector-type">{docs[0]?.type}</span>
      </div>
      {fields.map((field) => {
        const value = commonValue(docs, field);
        // Keyed by the value, so a box shows the new value after any edit, ours or not.
        const shown = value === MIXED ? 'mixed' : String(value);
        return (
          <InspectorField
            key={`${field.key}:${shown}`}
            field={field}
            value={value}
            onChange={(v) => session.editEach((doc) => field.patch(v, doc))}
          />
        );
      })}
      {!fields.length && <p className="inspector-note">Nothing to edit together here.</p>}
    </div>
  );
}

interface FieldProps {
  field: Field;
  value: FieldValue | undefined | typeof MIXED;
  onChange: (value: FieldValue) => void;
}

function InspectorField({ field, value, onChange }: Readonly<FieldProps>) {
  const mixed = value === MIXED;
  return (
    <label className="inspector-field">
      <span>{field.label}</span>
      {field.kind === 'check' && (
        <Checkbox checked={mixed ? 'indeterminate' : value === true} onCheckedChange={(v) => onChange(v === true)} />
      )}
      {field.kind === 'select' && (
        <SelectField
          value={mixed ? '' : String(value ?? '')}
          onValueChange={onChange}
          placeholder="Mixed"
          options={field.options ?? []}
        />
      )}
      {(field.kind === 'number' || field.kind === 'text' || field.kind === 'color') && (
        <TextInput field={field} value={mixed ? '' : String(value ?? '')} mixed={mixed} onChange={onChange} />
      )}
    </label>
  );
}

/** A text, number or colour box that sends its value when you press Enter or leave it. */
function TextInput({
  field,
  value,
  mixed,
  onChange,
}: Readonly<{ field: Field; value: string; mixed: boolean; onChange: (v: FieldValue) => void }>) {
  const [text, setText] = useState(value);
  const commit = () => {
    if (text !== value) onChange(text);
  };
  return (
    <Input
      type={field.kind === 'number' ? 'number' : 'text'}
      value={text}
      placeholder={mixed ? 'Mixed' : undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}
