import type { Edition, InventoryEntry, Spell } from '@vtt/system-dnd5e';
import { gameContent } from '../content.ts';
import { pipLeft, withSlotsLeft, withUsesLeft } from '../charges.ts';
import { carriedDrag, carriedLook } from '../carried.ts';
import { DRAG_TYPE } from '../drops.ts';
import { dragTile } from '../hotbar.ts';
import { attackArt, featureArt, spellArt } from '../icon-art.ts';
import { attackIcon, effectIcon, featureIcon, spellIcon } from '../icons.ts';
import { effectLeft } from '../session-time.ts';
import { ORDINAL } from '../spell-text.ts';
import { setStat } from '../token-edit.ts';
import { attackTip, featureTip, spellTip } from '../tooltip.ts';
import type { SheetProps } from './CharacterSheet.tsx';
import { NumberInput } from './EditorFields.tsx';
import { IconFace } from './Icon.tsx';
import { withKey } from './sheet-model.ts';
import { Adder, RemoveButton } from './SheetDetails.tsx';
import { TipCard } from './Tip.tsx';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Checkbox } from './kit/checkbox.tsx';

// The right-hand pages of the character sheet. Anything usable can be
// dragged onto the action bar; in edit mode the GM adds and removes things.

/** Gear is the same in both editions; the game's packs add their own. */
const items = () => gameContent('2014').items;
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const DRAG_HINT = 'Drag onto the action bar';

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

export function InventoryPage(props: Readonly<SheetProps>) {
  const { sheet } = props;
  return (
    <>
      <h4>Attacks</h4>
      <div className="bag">
        {sheet.attacks.map((a) => (
          <span
            key={a.name}
            className="bag-slot"
            tabIndex={0}
            draggable
            onDragStart={(e) => dragTile(e, { ref: `attack:${a.name}` })}
            aria-label={a.name}
            title={DRAG_HINT}
          >
            <IconFace icon={{ ...attackIcon(a), art: attackArt(a) }} size={24} />
            <TipCard tip={attackTip(a)} />
          </span>
        ))}
      </div>
      <h4>Inventory</h4>
      {props.edit ? <InventoryEdit {...props} /> : <Bag {...props} />}
    </>
  );
}

function Bag({ session, value, kind, sheet }: Readonly<SheetProps>) {
  const list = value.inventory ?? [];
  if (!list.length) return <p className="muted">Empty-handed.</p>;
  return (
    <div className="bag">
      {list.map((entry, i) => {
        const look = carriedLook(entry, sheet.edition);
        const item = items().get(entry.item);
        const use = () => {
          if (entry.spell) readScroll(session, value.id, entry.spell);
          else if (item && item.type !== 'gear') session.equip(value.id, i, !entry.equipped);
        };
        return (
          <button
            key={`${look.ref}-${i}`}
            className={entry.equipped ? 'bag-slot equipped' : 'bag-slot'}
            aria-label={look.name}
            draggable
            onDragStart={(e) => dragCarried(e, kind === 'token' ? value.id : undefined, entry, look.ref)}
            onClick={use}
          >
            <IconFace icon={look.icon} size={24} />
            {entry.qty > 1 && <span className="bag-qty">{entry.qty}</span>}
            <TipCard tip={look.tip} />
          </button>
        );
      })}
    </div>
  );
}

/** Dragged onto the action bar it's placed there; onto another creature on the map it's handed over. */
function dragCarried(e: React.DragEvent, token: string | undefined, entry: InventoryEntry, ref: string): void {
  if (token) e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(carriedDrag(token, entry)));
  dragTile(e, { ref });
}

/** Reads a scroll: the token is selected and the scroll's spell aimed. */
function readScroll(session: SheetProps['session'], token: string, spell: string): void {
  session.select(token);
  session.aimScroll(spell);
}

function InventoryEdit({ value, update, sheet }: Readonly<SheetProps>) {
  const list = value.inventory ?? [];
  const setList = (next: InventoryEntry[], now = true) =>
    update((d) => ({ ...d, inventory: next.length ? next : undefined }), now);
  const change = (i: number, entry: Partial<InventoryEntry>, now = true) =>
    setList(
      list.map((e, j) => (j === i ? { ...e, ...entry } : e)),
      now,
    );
  return (
    <>
      <ul className="rows ed-list">
        {list.map((e, i) => {
          const look = carriedLook(e, sheet.edition);
          return (
            <li
              key={`${look.ref}-${i}`}
              className="row"
              draggable
              onDragStart={(ev) => dragTile(ev, { ref: look.ref })}
            >
              <IconFace icon={look.icon} size={18} />
              <span className="row-name">{look.name}</span>
              <Input
                className="ed-qty"
                type="number"
                min={1}
                value={e.qty}
                aria-label="Quantity"
                onChange={(ev) => change(i, { qty: Math.max(1, Number(ev.target.value) || 1) }, false)}
              />
              <label className="ed-equip" title="Equipped">
                <Checkbox checked={e.equipped} onCheckedChange={(on) => change(i, { equipped: on === true })} />E
              </label>
              <RemoveButton onClick={() => setList(list.filter((_, j) => j !== i))} />
            </li>
          );
        })}
      </ul>
      <Adder
        placeholder="Add an item…"
        options={[...items().values()].map((it) => ({ id: it.id, name: it.name }))}
        onAdd={(item) => setList([...list, { item, qty: 1, equipped: false }])}
      />
    </>
  );
}

export function SpellsPage(props: Readonly<SheetProps & { rules: Edition }>) {
  const { sheet, value, edit, rules } = props;
  const caster = sheet.caster;
  const book = gameContent(rules).spells;
  const unknown = (value.stats?.spells ?? []).filter((id) => !book.has(id));
  const known = caster?.spells ?? [];
  const levels = [...new Set(known.map((s) => s.level))].sort((a, b) => a - b);
  return (
    <>
      {caster ? (
        <h4>
          Spells{' '}
          <span className="muted">
            · save DC {caster.dc} · attack {signed(caster.attack)}
          </span>
        </h4>
      ) : (
        <p className="muted">{edit ? 'Give the creature a caster class or spells to cast.' : 'No spellcasting.'}</p>
      )}
      <SlotPips {...props} />
      {levels.map((level) => (
        <div key={level} className="spell-level">
          <span className="spell-level-name">{level ? `${ORDINAL[level]} level` : 'Cantrips'}</span>
          <div className="bag">
            {known
              .filter((s) => s.level === level)
              .map((s) => (
                <SpellSlot key={s.id} {...props} spell={s} />
              ))}
          </div>
        </div>
      ))}
      {edit && unknown.length > 0 && (
        <p className="ed-bad">
          Not in the {rules} rules: {unknown.join(', ')}
        </p>
      )}
      {edit && <SpellAdder {...props} />}
    </>
  );
}

function SpellSlot({ value, update, edit, spell }: Readonly<SheetProps & { spell: Spell }>) {
  const own = value.stats?.spells?.includes(spell.id);
  const forget = () =>
    update(
      (d) =>
        setStat(
          d,
          'spells',
          (d.stats?.spells ?? []).filter((id) => id !== spell.id),
        ),
      true,
    );
  return (
    <span
      className="bag-slot"
      tabIndex={0}
      aria-label={spell.name}
      draggable
      onDragStart={(e) => dragTile(e, { ref: `spell:${spell.id}` })}
    >
      <IconFace icon={{ ...spellIcon(spell), art: spellArt(spell) }} size={24} />
      {edit && own && <RemoveButton className="slot-remove" onClick={forget} />}
      <TipCard tip={spellTip(spell)} />
    </span>
  );
}

function SpellAdder({ value, update, rules }: Readonly<SheetProps & { rules: Edition }>) {
  const known = value.stats?.spells ?? [];
  return (
    <Adder
      placeholder="Add a spell…"
      options={[...gameContent(rules).spells.values()]
        .filter((s) => !known.includes(s.id))
        .map((s) => ({ id: s.id, name: s.name }))}
      onAdd={(id) => update((d) => setStat(d, 'spells', [...(d.stats?.spells ?? []), id]), true)}
    />
  );
}

/** A feature granted on top of the class, as stored ("barbarian/rage"). */
const grantedRef = (granted: readonly string[] | undefined, id: string) => granted?.find((r) => r.endsWith(`/${id}`));

export function FeaturesPage({ sheet, edit, update, value }: Readonly<SheetProps>) {
  const granted = value.stats?.features;
  const revoke = (ref: string) =>
    update(
      (d) =>
        setStat(
          d,
          'features',
          (d.stats?.features ?? []).filter((r) => r !== ref),
        ),
      true,
    );
  const setUses = (id: string, max: number) => (left: number) =>
    update((d) => withKey(d, 'spent', withUsesLeft(d.spent, { id, left, max })), true);
  if (!sheet.features.length)
    return (
      <p className="muted">
        {edit
          ? 'Features come from the class and level (Details tab), or drag one from the Compendium.'
          : 'No features.'}
      </p>
    );
  return (
    <ul className="rows">
      {sheet.features.map((f) => (
        <li
          key={f.id}
          className="row has-tip"
          tabIndex={0}
          draggable={!!f.action}
          onDragStart={(e) => dragTile(e, { ref: `feature:${f.id}` })}
        >
          <IconFace icon={{ ...featureIcon(f), art: featureArt(f) }} size={18} />
          <span className="row-name">{f.name}</span>
          {f.max !== undefined && (
            <Pips
              name={f.name}
              feature
              left={f.left ?? 0}
              total={f.max}
              onChange={edit ? setUses(f.id, f.max) : undefined}
            />
          )}
          {edit && grantedRef(granted, f.id) && <RemoveButton onClick={() => revoke(grantedRef(granted, f.id)!)} />}
          <TipCard tip={featureTip(f)} />
        </li>
      ))}
    </ul>
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
