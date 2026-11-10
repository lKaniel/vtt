import { useState } from 'react';
import { dropOwn, type FeatureSheet } from '@vtt/system-dnd5e';
import { ZapIcon } from 'lucide-react';
import { t } from '../../i18n/index.ts';
import type { MessageKey } from '../../i18n/en.ts';
import { featureArt } from '../../icon-art.ts';
import { featureIcon } from '../../icons.ts';
import { withUsesLeft } from '../../play/charges.ts';
import { dragTile } from '../../play/hotbar.ts';
import { setStat } from '../../play/token-edit.ts';
import { rechargeText } from '../../text/monster-text.ts';
import { featureSections, matches } from '../../text/sheet-text.ts';
import { featureTip } from '../../text/tooltip.ts';
import { Badge } from '../kit/badge.tsx';
import { RemoveButton } from '../RemoveButton.tsx';
import { EditButton, isOwn, NewButton, useOwnEditor } from '../own/OwnEditor.tsx';
import { withKey } from '../sheet-model.ts';
import { LegendaryPanel } from './LegendaryPanel.tsx';
import { MonsterTraits } from './StatBlock.tsx';
import { PoolPanel } from './PoolPanel.tsx';
import { type Column, Empty, ListRow, ListSection, Pips, RowButton, SheetSearch } from './SheetList.tsx';
import { actFromSheet, canAct, type SheetProps } from './sheet-props.ts';

// The Features tab: a homebrew class's numbers, then the features used as
// actions and the always-on ones, with their uses and when they come back,
// and a legendary creature's actions. Features with an action go on the
// action bar by dragging or are used from the row; in edit mode uses are
// spent and restored by clicking, and granted or made ones can go.

const columns = (): Column[] => [
  { label: t('sheet.col.uses'), className: 'w-28' },
  { label: t('sheet.col.recovery'), className: 'w-24' },
];

export function FeaturesTab(props: Readonly<SheetProps>) {
  const { sheet, edit, update, value } = props;
  const [query, setQuery] = useState('');
  const own = useOwnEditor(value, update);
  const sections = featureSections(sheet.features.filter((f) => matches(f.name, query)));
  return (
    <>
      <SheetSearch value={query} onChange={setQuery} />
      <PoolPanel {...props} />
      {sheet.scales?.length ? (
        <div className="mb-3 flex flex-wrap gap-1" data-slot="scales">
          {sheet.scales.map((s) => (
            <Badge key={s.id} title={t('sheet.scaleTitle', { name: s.name })}>
              {s.name} {s.value}
            </Badge>
          ))}
        </div>
      ) : null}
      {sections.map((s) => (
        <ListSection key={s.id} title={t(`sheet.features.${s.id}` as MessageKey)} columns={columns()}>
          {s.features.map((f) => (
            <FeatureRow key={f.id} {...props} feature={f} onOpen={(id) => own.open('feature', id)} />
          ))}
        </ListSection>
      ))}
      {!sections.length && (
        <Empty>
          {query && t('sheet.nothingFound', { query })}
          {!query && (edit ? t('sheet.noFeaturesEdit') : t('sheet.noFeatures'))}
        </Empty>
      )}
      {edit && <NewButton label="New feature" onClick={() => own.create('feature')} />}
      {own.dialog}
      <LegendaryPanel {...props} />
      <MonsterTraits {...props} />
    </>
  );
}

/** A feature granted on top of the class, as stored ("barbarian/rage"). */
const grantedRef = (granted: readonly string[] | undefined, id: string) => granted?.find((r) => r.endsWith(`/${id}`));

type RowProps = SheetProps & { feature: FeatureSheet; onOpen: (id: string) => void };

/** When a feature's uses come back: after a rest, or on a d6 at the start of a monster's turn. */
const recovery = (f: FeatureSheet) =>
  f.rechargeOn ? rechargeText(f.rechargeOn) : t(`sheet.recharge.${f.recharge}` as MessageKey);

function FeatureRow(props: Readonly<RowProps>) {
  const { edit, update, feature: f } = props;
  const setUses = (left: number) =>
    update((d) => withKey(d, 'spent', withUsesLeft(d.spent, { id: f.id, left, max: f.max! })), true);
  const limited = f.max !== undefined;
  const uses = limited && (
    <Pips name={f.name} feature left={f.left ?? 0} total={f.max!} onChange={edit ? setUses : undefined} />
  );
  return (
    <ListRow
      icon={{ ...featureIcon(f), art: featureArt(f) }}
      name={f.name}
      tip={featureTip(f)}
      columns={columns()}
      cells={[uses, limited && recovery(f)]}
      faded={limited && f.left === 0}
      onDragStart={f.action ? (e) => dragTile(e, { ref: `feature:${f.id}` }) : undefined}
      controls={<FeatureControls {...props} />}
    />
  );
}

function FeatureControls(props: Readonly<RowProps>) {
  const { edit, update, value, feature: f, onOpen } = props;
  const ref = grantedRef(value.stats?.features, f.id);
  const mine = isOwn(value, 'feature', f.id);
  const remove = () =>
    update((d) => {
      if (mine) return dropOwn(d, 'feature', f.id);
      return setStat(
        d,
        'features',
        (d.stats?.features ?? []).filter((r) => r !== ref),
      );
    }, true);
  return (
    <>
      {f.action && canAct(props) && (
        <RowButton
          label={t('sheet.use', { name: f.name })}
          disabled={f.left === 0}
          onClick={() => actFromSheet(props, `feature:${f.id}`)}
        >
          <ZapIcon />
        </RowButton>
      )}
      {edit && mine && <EditButton name={f.name} onClick={() => onOpen(f.id)} />}
      {edit && (ref !== undefined || mine) && <RemoveButton onClick={remove} />}
    </>
  );
}
