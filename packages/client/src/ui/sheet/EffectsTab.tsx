import { useState } from 'react';
import { changeText, type Effect } from '@vtt/system-dnd5e';
import { auraText, newEffect, removeEffect, setEffect } from '../../content/effect-edit.ts';
import { effectIcon } from '../../icons.ts';
import { effectLeft } from '../../session/session-time.ts';
import { PlusIcon } from 'lucide-react';
import { t } from '../../i18n/index.ts';
import type { MessageKey } from '../../i18n/en.ts';
import type { SheetProps } from './sheet-props.ts';
import { type Column, Empty, ListRow, ListSection } from './SheetList.tsx';
import { RemoveButton } from '../RemoveButton.tsx';
import { EditButton } from '../own/OwnEditor.tsx';
import { EffectForm } from '../own/EffectForm.tsx';
import { Button } from '../kit/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../kit/dialog.tsx';

const columns = (): Column[] => [
  { label: t('sheet.col.effect'), className: 'w-64 text-left truncate' },
  { label: t('sheet.col.lasts'), className: 'w-20' },
];

/** What an effect does, for its row: its aura, conditions and changes by key. */
function effectDetail(e: Effect, nameOf: (token: string) => string | undefined): string {
  const changes = (e.changes ?? []).map(changeText);
  return [auraText(e, nameOf), e.conditions?.join(', '), ...changes].filter(Boolean).join(' · ');
}

/** Effects that run out (Foundry's temporary ones) first, then those that last. */
const temporary = (e: Effect) => e.rounds !== undefined || e.endsAt !== undefined;

/**
 * Spells, conditions and features on the creature: what it concentrates on,
 * then its temporary and lasting effects. In edit mode the sheet's editor
 * can make effects by hand, Active Effect style, with changes to any
 * statistic by key.
 */
export function EffectsTab(props: Readonly<SheetProps>) {
  const { value, edit, update } = props;
  const [open, setOpen] = useState<string>();
  const effects = value.effects ?? [];
  const create = () => {
    const made = newEffect(value);
    update(() => made.draft, true);
    setOpen(made.id);
  };
  const sections = [
    { id: 'temporary', list: effects.filter(temporary) },
    { id: 'passive', list: effects.filter((e) => !temporary(e)) },
  ].filter((s) => s.list.length);
  return (
    <>
      {value.concentration && <Concentration {...props} />}
      {sections.map((s) => (
        <ListSection key={s.id} title={t(`sheet.effects.${s.id}` as MessageKey)} columns={columns()}>
          {s.list.map((e) => (
            <EffectRow key={e.id} {...props} effect={e} onOpen={() => setOpen(e.id)} />
          ))}
        </ListSection>
      ))}
      {!effects.length && !value.concentration && <Empty>{t('sheet.noEffects', { name: value.name })}</Empty>}
      {edit && (
        <Button variant="outline" size="sm" className="mt-2" onClick={create}>
          <PlusIcon /> {t('sheet.newEffect')}
        </Button>
      )}
      <EffectEditor {...props} id={open} onClose={() => setOpen(undefined)} />
    </>
  );
}

function EffectRow(props: Readonly<SheetProps & { effect: Effect; onOpen: () => void }>) {
  const { session, value, kind, edit, update, effect: e, onOpen } = props;
  const nameOf = (id: string) => session.tokens.get(id)?.name;
  const at = { now: session.time.now(), fighting: !!session.combat };
  const remove = () =>
    edit ? update((d) => removeEffect(d, e.id), true) : session.requests.removeEffect(value.id, e.id);
  // An aura's copy comes and goes with the aura.
  const own = !e.auraFrom;
  return (
    <ListRow
      icon={effectIcon(e)}
      name={e.name}
      columns={columns()}
      cells={[effectDetail(e, nameOf), effectLeft(e, at) ?? '']}
      controls={
        <>
          {edit && own && <EditButton name={e.name} onClick={onOpen} />}
          {own && (edit || (session.isGm() && kind === 'token')) && <RemoveButton onClick={remove} />}
        </>
      }
    />
  );
}

function Concentration({ session, value, kind }: Readonly<SheetProps>) {
  return (
    <ListSection title={t('sheet.concentration')} columns={[]}>
      <ListRow
        icon={{ glyph: 'eye', tint: 'arcane' }}
        name={t('sheet.concentrating', { spell: value.concentration!.name })}
        columns={[]}
        cells={[]}
        controls={
          kind === 'token' && (
            <Button variant="outline" size="sm" onClick={() => session.requests.dropConcentration(value.id)}>
              {t('sheet.stop')}
            </Button>
          )
        }
      />
    </ListSection>
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
