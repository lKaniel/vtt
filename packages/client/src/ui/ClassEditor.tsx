import type { Doc } from '@vtt/core';
import { ABILITIES, type Ability, type Class, homebrewIssues, type Spellcasting } from '@vtt/system-dnd5e';
import { useState } from 'react';
import { classOfDoc, classPatch, levelTableText, parseLevelTable } from '../content/homebrew-edit.ts';
import type { Session } from '../session/session.ts';
import { Field, NumberInput, TextInput } from './EditorFields.tsx';
import { FeatureList, NamedRows, SubclassList } from './ClassEditorParts.tsx';
import { Button } from './kit/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './kit/dialog.tsx';
import { SelectField } from './kit/select.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';
import { t } from '../i18n/index.ts';

// The GM's editor for a homebrew class: its hit die, saves and spellcasting,
// the numbers that grow with its level, the picks it offers, its features by
// level and its subclasses. Saved as one edit, so Ctrl+Z takes it back.

type Set = (patch: Partial<Class>) => void;

const DICE = [6, 8, 10, 12].map((d) => ({ value: String(d), label: `d${d}` }));
const progressions = () => [
  { value: 'none', label: t('classEditor.noCasting') },
  { value: 'full', label: t('classEditor.full') },
  { value: 'half', label: t('classEditor.half') },
  { value: 'third', label: t('classEditor.third') },
  { value: 'pact', label: t('classEditor.pact') },
];
const ABILITY_OPTIONS = ABILITIES.map((a) => ({ value: a, label: a.toUpperCase() }));

export function ClassEditor({ session, doc, onClose }: Readonly<{ session: Session; doc: Doc; onClose: () => void }>) {
  const [draft, setDraft] = useState<Class>(() => classOfDoc(doc));
  const set: Set = (patch) => setDraft({ ...draft, ...patch });
  const issues = homebrewIssues({ ...draft, kind: 'class' });
  const save = () => {
    session.journal.patchEntry('homebrew', doc.id, classPatch(draft), 'edit class');
    onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(860px,calc(100vw-32px))]" data-slot="class-editor">
        <DialogTitle>{draft.name}</DialogTitle>
        <DialogDescription>
          {t('classEditor.byId')} <code>{doc.id}</code>. {t('classEditor.tables')}
        </DialogDescription>
        <Basics draft={draft} set={set} />
        <Advancement draft={draft} set={set} />
        <h4 className="font-display text-sm text-gold">{t('classEditor.features')}</h4>
        <FeatureList
          features={draft.features}
          choices={draft.choices ?? []}
          onChange={(features) => set({ features })}
        />
        <h4 className="font-display text-sm text-gold">{t('classEditor.subclasses')}</h4>
        <SubclassList draft={draft} set={set} />
        {issues.length > 0 && <p className="text-sm text-[#e7b670]">{issues[0]}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('classEditor.cancel')}
          </Button>
          <Button disabled={issues.length > 0} onClick={save}>
            {t('classEditor.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Basics({ draft, set }: Readonly<{ draft: Class; set: Set }>) {
  return (
    <>
      <div className="ed-grid items-end">
        <Field label={t('own.name')}>
          <TextInput value={draft.name} onChange={(name) => name && set({ name })} />
        </Field>
        <Field label={t('classEditor.hitDie')}>
          <SelectField
            value={String(draft.hitDie)}
            onValueChange={(d) => set({ hitDie: Number(d) })}
            options={DICE}
            aria-label={t('classEditor.hitDie')}
          />
        </Field>
        <Casting draft={draft} set={set} />
      </div>
      <Field label={t('classEditor.saves')}>
        <ToggleGroup
          type="multiple"
          value={draft.saves}
          onValueChange={(saves) => set({ saves: saves as Ability[] })}
          aria-label={t('classEditor.saves')}
        >
          {ABILITIES.map((a) => (
            <ToggleGroupItem key={a} value={a}>
              {a.toUpperCase()}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
    </>
  );
}

function Casting({ draft, set }: Readonly<{ draft: Class; set: Set }>) {
  const casting = draft.spellcasting;
  const change = (patch: Partial<Spellcasting>) =>
    set({ spellcasting: { ability: 'int', progression: 'full', from: 1, ...casting, ...patch } });
  return (
    <>
      <Field label={t('classEditor.casting')}>
        <SelectField
          value={casting?.progression ?? 'none'}
          onValueChange={(p) =>
            p === 'none' ? set({ spellcasting: undefined }) : change({ progression: p as Spellcasting['progression'] })
          }
          options={progressions()}
          aria-label={t('classEditor.casting')}
        />
      </Field>
      {casting && (
        <>
          <Field label={t('classEditor.ability')}>
            <SelectField
              value={casting.ability}
              onValueChange={(a) => change({ ability: a as Ability })}
              options={ABILITY_OPTIONS}
              aria-label={t('classEditor.ability')}
            />
          </Field>
          <Field label={t('classEditor.from')}>
            <NumberInput value={casting.from} min={1} onChange={(from) => change({ from: from ?? 1 })} />
          </Field>
        </>
      )}
    </>
  );
}

/** Custom advancement: scale values and choices, each a name and a level table. */
function Advancement({ draft, set }: Readonly<{ draft: Class; set: Set }>) {
  const scales = draft.scales ?? [];
  const choices = draft.choices ?? [];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <section className="flex flex-col gap-1">
        <h4 className="font-display text-sm text-gold">{t('classEditor.scales')}</h4>
        <NamedRows
          rows={scales.map((s) => ({ id: s.id, name: s.name, table: levelTableText(s.values) }))}
          tableLabel={t('classEditor.valueByLevel')}
          placeholder={t('classEditor.scaleHint')}
          onChange={(rows) =>
            set({
              scales: rows.length
                ? rows.map((r) => ({ id: r.id, name: r.name, values: parseLevelTable(r.table) }))
                : undefined,
            })
          }
        />
      </section>
      <section className="flex flex-col gap-1">
        <h4 className="font-display text-sm text-gold">{t('classEditor.choices')}</h4>
        <NamedRows
          rows={choices.map((c) => ({ id: c.id, name: c.name, table: levelTableText(c.count) }))}
          tableLabel={t('classEditor.picksByLevel')}
          placeholder={t('classEditor.choiceHint')}
          onChange={(rows) =>
            set({
              choices: rows.length
                ? rows.map((r) => ({ id: r.id, name: r.name, count: parseLevelTable(r.table) }))
                : undefined,
            })
          }
        />
      </section>
    </div>
  );
}
