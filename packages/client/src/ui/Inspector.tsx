import { useState } from 'react';
import type { Doc } from '@vtt/core';
import { commonValue, fieldsFor, MIXED, type Field, type FieldValue } from '../editor/inspector.ts';
import type { Session } from '../session/session.ts';
import { Input } from './kit/input.tsx';
import { Textarea } from './kit/textarea.tsx';
import { Checkbox } from './kit/checkbox.tsx';
import { SelectField } from './kit/select.tsx';
import { Button } from './kit/button.tsx';
import { MediaInput } from './MediaPicker.tsx';
import { TriggerDialog } from './TriggerDialog.tsx';
import { Window } from './kit/window.tsx';
import type { Size } from './kit/window-stack.ts';

/** High on the right, just left of the side panel (336 px) and clear of the action bar, until moved. */
const inspectorPlace = (view: Size) => ({ x: Math.max(8, view.width - 336 - 268), y: 110 });

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

/** The fields of `docs` this seat may set; the floor only on a scene with floors. */
function shownFields(session: Session, docs: readonly Doc[]): Field[] {
  const floors = !!session.world?.levels?.length;
  return fieldsFor(docs)
    .filter((f) => session.isGm() || !GM_FIELDS.has(f.key))
    .filter((f) => floors || f.choices !== 'levels')
    .map((f) => withChoices(f, session));
}

/** The panel of the selection's fields (the GM's, or a player's own drawings); a change is one undo step for the whole selection. */
export function Inspector({ session }: Readonly<{ session: Session }>) {
  if (!session.editor.selection.length || !session.editor.canEditSelection()) return null;
  const docs = session.editor.selectedDocs().map((d) => d.doc);
  // A creature picked to play opens nothing: its GM switches are on the token HUD and its sheet.
  if (docs.every((d) => d.type === 'token')) return null;
  const fields = shownFields(session, docs);
  const count = session.editor.selection.length;
  return (
    <Window
      id="inspector"
      kind="inspector"
      initial={inspectorPlace}
      title={
        <>
          {count === 1 ? (docs[0]?.id ?? '') : `${count} selected`}
          <span className="inspector-type ml-2">{docs[0]?.type}</span>
        </>
      }
      label="Inspector"
      onClose={() => session.editor.setSelection([])}
      closeLabel="Deselect"
      className="inspector w-[260px]"
      bodyClassName="gap-1.5 px-3 py-2"
    >
      {fields.map((field) => {
        const value = commonValue(docs, field);
        // Keyed by the value, so a box shows the new value after any edit, ours or not.
        const shown = value === MIXED ? 'mixed' : String(value);
        return (
          <InspectorField
            key={`${field.key}:${shown}`}
            session={session}
            field={field}
            value={value}
            onChange={(v) => session.editor.editEach((doc) => field.patch(v, doc))}
          />
        );
      })}
      {!fields.length && <p className="inspector-note">Nothing to edit together here.</p>}
      {session.isGm() && count === 1 && triggerable(docs[0]!) && <TriggerButton session={session} doc={docs[0]!} />}
    </Window>
  );
}

/** A tile with a picture or a region: it can run a chain of actions. */
const triggerable = (doc: Doc) => doc.type === 'region' || (doc.type === 'tile' && doc.kind !== 'group');

function TriggerButton({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const [open, setOpen] = useState(false);
  const verb = doc.trigger ? 'Edit' : 'Add';
  const label = doc.type === 'region' ? 'Behaviours…' : `${verb} trigger…`;
  return (
    <>
      <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <TriggerDialog key={doc.id} session={session} doc={doc} onClose={() => setOpen(false)} />}
    </>
  );
}

interface FieldProps {
  session: Session;
  field: Field;
  value: FieldValue | undefined | typeof MIXED;
  onChange: (value: FieldValue) => void;
}

function InspectorField(props: Readonly<FieldProps>) {
  return (
    <label className="inspector-field">
      <span>{props.field.label}</span>
      <FieldInput {...props} />
    </label>
  );
}

/** The input of one field, by its kind. */
function FieldInput({ session, field, value, onChange }: Readonly<FieldProps>) {
  const mixed = value === MIXED;
  const shown = mixed ? '' : String(value ?? '');
  if (field.kind === 'check') {
    return (
      <Checkbox checked={mixed ? 'indeterminate' : value === true} onCheckedChange={(v) => onChange(v === true)} />
    );
  }
  if (field.kind === 'select') {
    return <SelectField value={shown} onValueChange={onChange} placeholder="Mixed" options={field.options ?? []} />;
  }
  if (field.kind === 'media') {
    const placeholder = mixed ? 'Mixed' : undefined;
    const kind = field.media ?? 'image';
    return <MediaInput {...{ session, kind, value: shown, placeholder, onChange }} label={field.label} />;
  }
  if (field.kind === 'longtext') return <LongTextInput value={shown} mixed={mixed} onChange={onChange} />;
  return <TextInput field={field} value={shown} mixed={mixed} onChange={onChange} />;
}

/** Text over several lines (a description) that sends its value when you leave it. */
function LongTextInput({
  value,
  mixed,
  onChange,
}: Readonly<{ value: string; mixed: boolean; onChange: (v: FieldValue) => void }>) {
  const [text, setText] = useState(value);
  return (
    <Textarea
      value={text}
      rows={3}
      placeholder={mixed ? 'Mixed' : undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onChange(text)}
    />
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
