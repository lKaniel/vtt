import { useState } from 'react';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { changeOwn, type Feature, type Item, makeOwn, type OwnKind, type Spell } from '@vtt/system-dnd5e';
import { Button } from '../kit/button.tsx';
import type { Update } from '../sheet-model.ts';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../kit/dialog.tsx';
import { FeatureForm } from './FeatureForm.tsx';
import { ItemForm } from './ItemForm.tsx';
import { SpellForm } from './SpellForm.tsx';
import type { Draft } from '../sheet-model.ts';

/** Which own entry is open in the editor. */
interface Editing {
  kind: OwnKind;
  id: string;
}

const TITLES = { item: 'Item', spell: 'Spell', feature: 'Feature' };

/** The window that edits something made on this sheet; every change saves itself. */
function OwnEditor({
  value,
  update,
  editing,
  onClose,
}: Readonly<{ value: Draft; update: Update; editing: Editing | undefined; onClose: () => void }>) {
  const entry = editing && value.own?.[`${editing.kind}s`]?.find((x) => x.id === editing.id);
  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      {editing && entry && (
        <DialogContent>
          <DialogTitle>
            {TITLES[editing.kind]}: {entry.name}
          </DialogTitle>
          <DialogDescription>Made on this sheet. Changes save as you type.</DialogDescription>
          <OwnForm editing={editing} entry={entry} update={update} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function OwnForm({
  editing,
  entry,
  update,
}: Readonly<{ editing: Editing; entry: Item | Spell | Feature; update: Update }>) {
  const save = (next: Item | Spell | Feature) => update((d) => changeOwn(d, editing.kind, next as never), false);
  if (editing.kind === 'item') return <ItemForm key={entry.id} item={entry as Item} onSave={save} />;
  if (editing.kind === 'spell') return <SpellForm key={entry.id} spell={entry as Spell} onSave={save} />;
  return <FeatureForm key={entry.id} feature={entry as Feature} onSave={save} />;
}

/**
 * Making things on a sheet: `create` adds a blank one and opens it, `open`
 * opens one made earlier; render `dialog` once on the page.
 */
export function useOwnEditor(value: Draft, update: Update) {
  const [editing, setEditing] = useState<Editing>();
  const create = (kind: OwnKind) => {
    const { id } = makeOwn(value, kind);
    update((d) => makeOwn(d, kind).sheet, true);
    setEditing({ kind, id });
  };
  const dialog = <OwnEditor value={value} update={update} editing={editing} onClose={() => setEditing(undefined)} />;
  return { create, open: (kind: OwnKind, id: string) => setEditing({ kind, id }), dialog };
}

/** Whether `id` was made on this sheet (rather than taken from a compendium). */
export const isOwn = (value: Draft, kind: OwnKind, id: string) => !!value.own?.[`${kind}s`]?.some((x) => x.id === id);

/** The "New …" button at the foot of a page, with where existing things come from. */
export function NewButton({ label, onClick }: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={onClick}>
        <PlusIcon /> {label}
      </Button>
      <span className="muted text-xs">Existing ones: drag from the Compendium.</span>
    </div>
  );
}

/** The pencil that opens something made on this sheet. */
export function EditButton({ name, onClick }: Readonly<{ name: string; onClick: () => void }>) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Edit ${name}`}
      title="Edit"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <PencilIcon />
    </Button>
  );
}
