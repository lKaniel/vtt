import { useState } from 'react';
import { changeText, type Effect } from '@vtt/system-dnd5e';
import { newEffect, removeEffect, setEffect } from '../effect-edit.ts';
import { effectIcon } from '../icons.ts';
import { effectLeft } from '../session-time.ts';
import type { SheetProps } from './CharacterSheet.tsx';
import { IconFace } from './Icon.tsx';
import { RemoveButton } from './SheetDetails.tsx';
import { EditButton } from './own/OwnEditor.tsx';
import { EffectForm } from './own/EffectForm.tsx';
import { Button } from './kit/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './kit/dialog.tsx';

/** What an effect does, for its row: conditions, changes by key, time left. */
function effectDetail(e: Effect, left: { now: number; fighting: boolean }): string {
  const changes = (e.changes ?? []).map(changeText);
  return [e.conditions?.join(', '), ...changes, effectLeft(e, left)].filter(Boolean).join(' · ');
}

/**
 * Spells, conditions and features on the creature. In edit mode the sheet's
 * editor can make effects by hand, Active Effect style, with changes to any
 * statistic by key.
 */
export function EffectsPage(props: Readonly<SheetProps>) {
  const { session, value, kind, edit, update } = props;
  const [open, setOpen] = useState<string>();
  const effects = value.effects ?? [];
  const left = { now: session.gameTime(), fighting: !!session.combat };
  const remove = (id: string) => (edit ? update((d) => removeEffect(d, id), true) : session.removeEffect(value.id, id));
  const create = () => {
    const made = newEffect(value);
    update(() => made.draft, true);
    setOpen(made.id);
  };
  return (
    <>
      {!effects.length && !value.concentration && <p className="muted">Nothing is affecting {value.name}.</p>}
      <ul className="rows">
        {value.concentration && <ConcentrationRow {...props} />}
        {effects.map((e) => (
          <li key={e.id} className="row">
            <IconFace icon={effectIcon(e)} size={16} />
            <span className="row-name">{e.name}</span>
            <span className="row-detail">{effectDetail(e, left)}</span>
            {edit && <EditButton name={e.name} onClick={() => setOpen(e.id)} />}
            {(edit || (session.isGm() && kind === 'token')) && <RemoveButton onClick={() => remove(e.id)} />}
          </li>
        ))}
      </ul>
      {edit && (
        <Button variant="outline" size="sm" className="mt-2" onClick={create}>
          New effect
        </Button>
      )}
      <EffectEditor {...props} id={open} onClose={() => setOpen(undefined)} />
    </>
  );
}

function ConcentrationRow({ session, value, kind }: Readonly<SheetProps>) {
  return (
    <li className="row">
      <IconFace icon={{ glyph: 'eye', tint: 'arcane' }} size={16} />
      <span className="row-name">Concentrating on {value.concentration!.name}</span>
      {kind === 'token' && (
        <Button variant="outline" size="sm" onClick={() => session.dropConcentration(value.id)}>
          Stop
        </Button>
      )}
    </li>
  );
}

function EffectEditor({ value, update, id, onClose }: Readonly<SheetProps & { id?: string; onClose: () => void }>) {
  const effect = id ? value.effects?.find((e) => e.id === id) : undefined;
  return (
    <Dialog open={!!effect} onOpenChange={(o) => !o && onClose()}>
      {effect && (
        <DialogContent>
          <DialogTitle>Effect: {effect.name}</DialogTitle>
          <DialogDescription>Changes save as you make them.</DialogDescription>
          <EffectForm key={effect.id} effect={effect} onSave={(e) => update((d) => setEffect(d, e), false)} />
        </DialogContent>
      )}
    </Dialog>
  );
}
