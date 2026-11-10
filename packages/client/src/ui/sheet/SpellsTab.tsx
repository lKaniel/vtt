import { useState } from 'react';
import { ABILITIES, type CasterSheet, dropOwn, type Edition, knownSpellIds, type Spell } from '@vtt/system-dnd5e';
import { WandSparklesIcon } from 'lucide-react';
import { contentFor } from '../../content/content.ts';
import { t } from '../../i18n/index.ts';
import { withSlotsLeft } from '../../play/charges.ts';
import { dragTile } from '../../play/hotbar.ts';
import { setStat } from '../../play/token-edit.ts';
import { spellArt } from '../../icon-art.ts';
import { spellIcon } from '../../icons.ts';
import { ORDINAL } from '../../text/spell-text.ts';
import { matches, signed, spellColumns } from '../../text/sheet-text.ts';
import { spellTip } from '../../text/tooltip.ts';
import { Badge } from '../kit/badge.tsx';
import { SelectField } from '../kit/select.tsx';
import { RemoveButton } from '../RemoveButton.tsx';
import { EditButton, isOwn, NewButton, useOwnEditor } from '../own/OwnEditor.tsx';
import { withKey } from '../sheet-model.ts';
import { abilityName } from './AbilityRow.tsx';
import { type Column, Empty, ListRow, ListSection, Pips, RowButton, SheetSearch } from './SheetList.tsx';
import { actFromSheet, canAct, type SheetProps } from './sheet-props.ts';

// The Spells tab: how the creature casts (ability, attack, save DC), then
// its spells by level, each level with its slots, in Foundry's columns.
// Spells are dragged onto the action bar or cast from the row; in edit mode
// the slots are spent and restored by clicking, spells made here open, and
// learnt or made ones can be forgotten.

const columns = (): Column[] => [
  { label: t('sheet.col.time'), className: 'w-16' },
  { label: t('sheet.col.range'), className: 'w-16' },
  { label: t('sheet.col.roll'), className: 'w-20' },
];

type Props = SheetProps & { rules: Edition };

export function SpellsTab(props: Readonly<Props>) {
  const { sheet, value, edit, rules } = props;
  const [query, setQuery] = useState('');
  const caster = sheet.caster;
  const book = contentFor(value, rules).spells;
  const own = useOwnEditor(value, props.update);
  const unknown = (value.stats?.spells ?? []).filter((id) => !book.has(id));
  // Without spellcasting it can't cast them, but the sheet still lists what it has.
  const known = (
    caster?.spells ??
    knownSpellIds(value)
      .map((id) => book.get(id))
      .filter((sp): sp is Spell => !!sp)
  ).filter((s) => matches(s.name, query));
  const levels = [...new Set(known.map((s) => s.level))].sort((a, b) => a - b);
  return (
    <>
      <Casting caster={caster} edit={edit} update={props.update} />
      <SheetSearch value={query} onChange={setQuery} />
      {levels.map((level) => (
        <ListSection
          key={level}
          title={level ? t('sheet.spellLevel', { level: ORDINAL[level]! }) : t('sheet.cantrips')}
          aside={level > 0 && <SlotPips {...props} level={level} />}
          columns={columns()}
        >
          {known
            .filter((s) => s.level === level)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => (
              <SpellRow key={s.id} {...props} spell={s} onOpen={(id) => own.open('spell', id)} />
            ))}
        </ListSection>
      ))}
      {query && !known.length && <Empty>{t('sheet.nothingFound', { query })}</Empty>}
      {edit && unknown.length > 0 && (
        <p className="text-sm text-destructive">{t('sheet.notInRules', { rules, ids: unknown.join(', ') })}</p>
      )}
      {edit && <NewButton label="New spell" onClick={() => own.create('spell')} />}
      {own.dialog}
    </>
  );
}

/**
 * The spellcasting ability, attack bonus and save DC, as three boxes; or why
 * there are none. A creature with no spellcasting casts its homemade spells
 * without slots, with the ability picked here in edit mode.
 */
function Casting({
  caster,
  edit,
  update,
}: Readonly<{ caster: CasterSheet | undefined; edit: boolean; update: Props['update'] }>) {
  if (!caster) return <Empty>{edit ? t('sheet.noCastingEdit') : t('sheet.noCasting')}</Empty>;
  const homemade = !!caster.atWill;
  const boxes = [
    [t('sheet.spellAbility'), abilityName(caster.ability)],
    [t('sheet.spellAttack'), signed(caster.attack)],
    [t('sheet.spellDc'), String(caster.dc)],
  ] as const;
  return (
    <div className="mb-3 grid grid-cols-3 gap-2" aria-label={t('sheet.spellcasting')}>
      {boxes.map(([label, text]) => (
        <div key={label} className="flex flex-col items-center rounded-[3px] art-hairline py-1.5">
          <span className="font-display text-lg text-gold-bright">{text}</span>
          <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</span>
        </div>
      ))}
      {homemade && <HomemadeCasting ability={caster.ability} edit={edit} update={update} />}
    </div>
  );
}

/** How a non-caster casts its homemade spells: at their own level, no slot, with this ability. */
function HomemadeCasting({
  ability,
  edit,
  update,
}: Readonly<{ ability: CasterSheet['ability']; edit: boolean; update: Props['update'] }>) {
  const pick = (v: string) =>
    update((d) => setStat(d, 'spellcasting', { ability: v as CasterSheet['ability'], progression: 'none' }), true);
  return (
    <div className="col-span-3 flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex-1">{t('sheet.homemadeCasting')}</span>
      {edit && (
        <SelectField
          aria-label={t('sheet.homemadeAbility')}
          className="w-32"
          value={ability}
          onValueChange={pick}
          options={ABILITIES.map((a) => ({ value: a, label: abilityName(a) }))}
        />
      )}
    </div>
  );
}

/** A level's slots left; the GM spends and restores them in edit mode. */
function SlotPips({ sheet, edit, update, level }: Readonly<Props & { level: number }>) {
  const caster = sheet.caster;
  const total = caster?.slots[level - 1] ?? 0;
  if (!caster || !total) return null;
  const set = (left: number) =>
    update((d) => withKey(d, 'spent', withSlotsLeft(d.spent, { level, left, total })), true);
  return (
    <span className="font-body text-xs tracking-normal">
      <Pips
        name={t('sheet.slots', { level: ORDINAL[level]!, left: caster.left[level - 1] ?? 0, total })}
        left={caster.left[level - 1] ?? 0}
        total={total}
        onChange={edit ? set : undefined}
      />
    </span>
  );
}

function SpellRow(props: Readonly<Props & { spell: Spell; onOpen: (id: string) => void }>) {
  const { value, update, edit, spell, sheet, onOpen } = props;
  const mine = isOwn(value, 'spell', spell.id);
  const learnt = !!value.stats?.spells?.includes(spell.id);
  const forget = () =>
    update((d) => {
      const kept = setStat(
        d,
        'spells',
        (d.stats?.spells ?? []).filter((id) => id !== spell.id),
      );
      return mine ? dropOwn(kept, 'spell', spell.id) : kept;
    }, true);
  const cols = spellColumns(spell, sheet.caster);
  const castable = canAct(props) && !!sheet.caster;
  return (
    <ListRow
      icon={{ ...spellIcon(spell), art: spellArt(spell) }}
      name={spell.name}
      tags={<SpellTags spell={spell} />}
      tip={spellTip(spell)}
      columns={columns()}
      cells={[cols.time, cols.range, cols.roll]}
      onDragStart={(e) => dragTile(e, { ref: `spell:${spell.id}` })}
      controls={
        <>
          {castable && (
            <RowButton
              label={t('sheet.cast', { name: spell.name })}
              onClick={() => actFromSheet(props, `spell:${spell.id}`)}
            >
              <WandSparklesIcon />
            </RowButton>
          )}
          {edit && mine && <EditButton name={spell.name} onClick={() => onOpen(spell.id)} />}
          {edit && (learnt || mine) && <RemoveButton onClick={forget} />}
        </>
      }
    />
  );
}

function SpellTags({ spell }: Readonly<{ spell: Spell }>) {
  return (
    <>
      {spell.concentration && (
        <Badge variant="muted" className="px-1 py-0 text-[10px]" title={t('sheet.concentration')}>
          C
        </Badge>
      )}
      {spell.ritual && (
        <Badge variant="muted" className="px-1 py-0 text-[10px]" title={t('sheet.ritual')}>
          R
        </Badge>
      )}
    </>
  );
}
