import { useState } from 'react';
import { commonValue, fieldsFor, MIXED, type Field, type FieldValue } from '../editor/inspector.ts';
import type { Session } from '../session.ts';

/** The GM's panel of the selection's fields; a change is one undo step for the whole selection. */
export function Inspector({ session }: Readonly<{ session: Session }>) {
  if (!session.isGm() || !session.selection.length) return null;
  const docs = session.selectedDocs().map((d) => d.doc);
  const fields = fieldsFor(docs);
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
            onChange={(v) => session.editSelection(field.patch(v))}
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
        <input
          type="checkbox"
          checked={value === true}
          ref={(el) => {
            if (el) el.indeterminate = mixed;
          }}
          onChange={(e) => onChange(e.target.checked)}
        />
      )}
      {field.kind === 'select' && (
        <select value={mixed ? '' : String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {mixed && <option value="">Mixed</option>}
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
    <input
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
