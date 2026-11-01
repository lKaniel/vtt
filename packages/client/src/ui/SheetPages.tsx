import { dropOwn, type Edition, knownSpellIds, type OwnKind, type Spell, withOwn } from '@vtt/system-dnd5e';
import { gameContent } from '../content.ts';
import { pipLeft, withSlotsLeft, withUsesLeft } from '../charges.ts';
import { dragTile } from '../hotbar.ts';
import { featureArt, spellArt } from '../icon-art.ts';
import { effectIcon, featureIcon, spellIcon } from '../icons.ts';
import { effectLeft } from '../session-time.ts';
import { ORDINAL } from '../spell-text.ts';
import { setStat } from '../token-edit.ts';
import { featureTip, spellTip } from '../tooltip.ts';
import type { SheetProps } from './CharacterSheet.tsx';
import { NumberInput } from './EditorFields.tsx';
import { IconFace } from './Icon.tsx';
import { withKey } from './sheet-model.ts';
import { RemoveButton } from './SheetDetails.tsx';
import { EditButton, isOwn, NewButton, useOwnEditor } from './own/OwnEditor.tsx';
import { TipCard } from './Tip.tsx';
import { Button } from './kit/button.tsx';

// The right-hand pages of the character sheet. Anything usable can be
// dragged onto the action bar; in edit mode the GM makes new things here
// (existing ones are dragged from the Compendium) and removes them.

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

const MAX_PIPS = 10;

interface PipProps {
  name: string;
  left: number;
  total: number;
  onChange?: (left: number) => void;
  feature?: boolean;
}

/** Charges left: pips, or a number for big pools; in edit mode the GM spends and restores them. */
function Pips(props: Readonly<PipProps>) {
  const { name, left, total, onChange, feature } = props;
  if (total > MAX_PIPS) return <PoolLeft {...props} />;
  const cls = (k: number) => ['pip', feature && 'feature', k >= left && 'used'].filter(Boolean).join(' ');
  return (
    <span className="charge-row" title={`${name}: ${left} of ${total} left`}>
      {!feature && <span className="charge-row-name">{name}</span>}
      {Array.from({ length: total }, (_, k) =>
        onChange ? (
          <button
            key={k}
            className={cls(k)}
            aria-label={`${name} ${k + 1}`}
            onClick={() => onChange(pipLeft(k, left))}
          />
        ) : (
          <span key={k} className={cls(k)} />
        ),
      )}
    </span>
  );
}

function PoolLeft({ name, left, total, onChange }: Readonly<PipProps>) {
  if (!onChange)
    return (
      <span className="row-detail">
        {left}/{total}
      </span>
    );
  return (
    <span className="charge-row">
      <NumberInput
        className="pool-left"
        value={left}
        min={0}
        onChange={(v) => onChange(Math.min(total, Math.max(0, v ?? total)))}
      />
      <span className="muted" aria-label={`${name} uses`}>
        /{total}
      </span>
    </span>
  );
}

/** Spell slots left per level; the GM spends and restores them in edit mode. */
function SlotPips({ sheet, edit, update }: Readonly<SheetProps>) {
  const caster = sheet.caster;
  if (!caster?.slots.some((n) => n > 0)) return null;
  const set = (level: number, left: number) =>
    update((d) => withKey(d, 'spent', withSlotsLeft(d.spent, { level, left, total: caster.slots[level - 1]! })), true);
  return (
    <div className="charges" aria-label="Spell slots">
      {caster.slots.map((total, i) =>
        total ? (
          <Pips
            key={i}
            name={ORDINAL[i + 1]!}
            left={caster.left[i] ?? 0}
            total={total}
            onChange={edit ? (left) => set(i + 1, left) : undefined}
          />
        ) : null,
      )}
    </div>
  );
}

export function SpellsPage(props: Readonly<SheetProps & { rules: Edition }>) {
  const { sheet, value, edit, rules } = props;
  const caster = sheet.caster;
  const book = withOwn(gameContent(rules), value).spells;
  const own = useOwnEditor(value, props.update);
  const unknown = (value.stats?.spells ?? []).filter((id) => !book.has(id));
  // Without spellcasting it can't cast them, but the sheet still lists what it has.
  const known =
    caster?.spells ??
    knownSpellIds(value)
      .map((id) => book.get(id))
      .filter((sp): sp is Spell => !!sp);
  const levels = [...new Set(known.map((s) => s.level))].sort((a, b) => a - b);
  return (
    <>
      <SpellsHead caster={caster} edit={edit} />
      <SlotPips {...props} />
      {levels.map((level) => (
        <div key={level} className="spell-level">
          <span className="spell-level-name">{level ? `${ORDINAL[level]} level` : 'Cantrips'}</span>
          <div className="bag">
            {known
              .filter((s) => s.level === level)
              .map((s) => (
                <SpellSlot key={s.id} {...props} spell={s} onOpen={own.open} />
              ))}
          </div>
        </div>
      ))}
      {edit && unknown.length > 0 && (
        <p className="ed-bad">
          Not in the {rules} rules: {unknown.join(', ')}
        </p>
      )}
      {edit && <NewButton label="New spell" onClick={() => own.create('spell')} />}
      {own.dialog}
    </>
  );
}

/** The save DC and attack bonus, or why there are none. */
function SpellsHead({ caster, edit }: Readonly<{ caster: SheetProps['sheet']['caster']; edit: boolean }>) {
  if (caster)
    return (
      <h4>
        Spells{' '}
        <span className="muted">
          · save DC {caster.dc} · attack {signed(caster.attack)}
        </span>
      </h4>
    );
  return <p className="muted">{edit ? 'Give the creature a caster class to cast spells.' : 'No spellcasting.'}</p>;
}

type Open = (kind: OwnKind, id: string) => void;

/** A known spell; in edit mode one made here opens on click, and learnt or made ones can go. */
function SpellSlot({ value, update, edit, spell, onOpen }: Readonly<SheetProps & { spell: Spell; onOpen: Open }>) {
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
  return (
    <span
      className="bag-slot"
      tabIndex={0}
      aria-label={spell.name}
      draggable
      onDragStart={(e) => dragTile(e, { ref: `spell:${spell.id}` })}
      onClick={edit && mine ? () => onOpen('spell', spell.id) : undefined}
      title={edit && mine ? 'Click to edit' : undefined}
    >
      <IconFace icon={{ ...spellIcon(spell), art: spellArt(spell) }} size={24} />
      {edit && (learnt || mine) && <RemoveButton className="slot-remove" onClick={forget} />}
      <TipCard tip={spellTip(spell)} />
    </span>
  );
}

/** A feature granted on top of the class, as stored ("barbarian/rage"). */
const grantedRef = (granted: readonly string[] | undefined, id: string) => granted?.find((r) => r.endsWith(`/${id}`));

export function FeaturesPage(props: Readonly<SheetProps>) {
  const { sheet, edit, update, value } = props;
  const own = useOwnEditor(value, update);
  const empty = edit ? 'Features come from the class and level (Details tab).' : 'No features.';
  return (
    <>
      {sheet.features.length ? (
        <ul className="rows">
          {sheet.features.map((f) => (
            <FeatureRow key={f.id} {...props} feature={f} onOpen={own.open} />
          ))}
        </ul>
      ) : (
        <p className="muted">{empty}</p>
      )}
      {edit && <NewButton label="New feature" onClick={() => own.create('feature')} />}
      {own.dialog}
    </>
  );
}

type SheetFeature = SheetProps['sheet']['features'][number];

/** A feature with its uses; in edit mode, granted ones can go and ones made here open. */
function FeatureRow({
  edit,
  update,
  value,
  feature: f,
  onOpen,
}: Readonly<SheetProps & { feature: SheetFeature; onOpen: Open }>) {
  const ref = grantedRef(value.stats?.features, f.id);
  const granted = ref !== undefined;
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
  const setUses = (left: number) =>
    update((d) => withKey(d, 'spent', withUsesLeft(d.spent, { id: f.id, left, max: f.max! })), true);
  return (
    <li
      className="row has-tip"
      tabIndex={0}
      draggable={!!f.action}
      onDragStart={(e) => dragTile(e, { ref: `feature:${f.id}` })}
    >
      <IconFace icon={{ ...featureIcon(f), art: featureArt(f) }} size={18} />
      <span className="row-name">{f.name}</span>
      {f.max !== undefined && (
        <Pips name={f.name} feature left={f.left ?? 0} total={f.max} onChange={edit ? setUses : undefined} />
      )}
      {edit && mine && <EditButton name={f.name} onClick={() => onOpen('feature', f.id)} />}
      {edit && (granted || mine) && <RemoveButton onClick={remove} />}
      <TipCard tip={featureTip(f)} />
    </li>
  );
}

export function EffectsPage({ session, value, kind }: Readonly<SheetProps>) {
  const effects = value.effects ?? [];
  const gm = session.isGm();
  const left = { now: session.gameTime(), fighting: !!session.combat };
  if (!effects.length && !value.concentration) return <p className="muted">Nothing is affecting {value.name}.</p>;
  return (
    <ul className="rows">
      {value.concentration && (
        <li className="row">
          <IconFace icon={{ glyph: 'eye', tint: 'arcane' }} size={16} />
          <span className="row-name">Concentrating on {value.concentration.name}</span>
          {kind === 'token' && (
            <Button variant="outline" size="sm" onClick={() => session.dropConcentration(value.id)}>
              Stop
            </Button>
          )}
        </li>
      )}
      {effects.map((e) => (
        <li key={e.id} className="row">
          <IconFace icon={effectIcon(e)} size={16} />
          <span className="row-name">{e.name}</span>
          <span className="row-detail">
            {[e.conditions?.join(', '), effectLeft(e, left)].filter(Boolean).join(' · ')}
          </span>
          {gm && kind === 'token' && <RemoveButton onClick={() => session.removeEffect(value.id, e.id)} />}
        </li>
      ))}
    </ul>
  );
}
