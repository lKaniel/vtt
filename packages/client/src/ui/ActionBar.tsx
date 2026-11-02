import type { FeatureSheet, Item, TokenView, TurnBudget } from '@vtt/system-dnd5e';
import { useState } from 'react';
import { actionTiles, affordable, costOf, filterTiles, TABS, type ActionTile, type Tab } from '../actions.ts';
import { slotChoices } from '../charges.ts';
import {
  dragTile,
  landOn,
  hotbarSlots,
  hotbarTiles,
  moveOnHotbar,
  placeOnHotbar,
  removeFromHotbar,
  TILE_DRAG,
  type Slots,
  type TileDrag,
} from '../hotbar.ts';
import type { Glyph as GlyphName } from '../icons.ts';
import type { Session } from '../session.ts';
import type { Aiming } from '../targeting.ts';
import { ORDINAL } from '../spell-text.ts';
import { SmiteControls } from './SmiteControls.tsx';
import { attackTip, featureTip, itemTip, macroTip, spellTip } from '../tooltip.ts';
import { Glyph, IconFace } from './Icon.tsx';
import { EffectBadges, Face, HpBar } from './Portrait.tsx';
import { TipCard } from './Tip.tsx';
import { SelectField } from './kit/select.tsx';
import { Button } from './kit/button.tsx';
import { Toggle } from './kit/toggle.tsx';

const MIN_TILES = 30;

const TAB_GLYPH: Record<Tab, GlyphName> = { all: 'star', attacks: 'sword', spells: 'flame', features: 'fist' };
const TAB_LABEL: Record<Tab, string> = {
  all: 'Everything',
  attacks: 'Attacks',
  spells: 'Spells',
  features: 'Features',
};

/** The selected creature's turn budget: its own, or the one it shares with its leader. */
function budgetOf(session: Session, token: TokenView): TurnBudget | undefined {
  const combat = session.combat;
  if (!combat) return undefined;
  if (session.turnToken()?.id === token.id) return combat.left;
  return combat.side[token.id];
}

/** Does what a tile says: readies an attack, aims a spell, or uses a feature. */
export function activateTile(session: Session, token: TokenView, tile: ActionTile): void {
  if (tile.kind === 'attack') session.arm(session.armed === tile.name ? undefined : tile.name);
  else if (tile.kind === 'spell') aimTile(session, tile);
  else if (tile.kind === 'feature') activateFeature(session, token, tile.feature);
  else if (tile.kind === 'macro') session.runMacro(tile.macro.id, token.id);
  else readyItem(session, token, tile.item);
}

/** A feature aimed like a spell waits for its targets; any other goes off at once. */
function activateFeature(session: Session, token: TokenView, feature: FeatureSheet): void {
  if (!feature.spell) return session.useFeature(token.id, feature.id);
  session.aimFeature(session.aiming?.feature === feature.id ? undefined : feature.id);
}

/** A spell with no slot left can still be cast for free. */
export function canActivate(tile: ActionTile): boolean {
  return !tile.spent || tile.kind === 'spell';
}

function aimTile(session: Session, tile: Extract<ActionTile, { kind: 'spell' }>): void {
  if (session.aiming?.spell.id === tile.spell.id) return session.aim(undefined);
  if (tile.scroll) return session.aimScroll(tile.spell.id);
  session.aim(tile.spell.id, tile.slot ?? tile.spell.level, tile.slot === undefined && tile.spell.level > 0);
}

/** A weapon on the bar readies its attack; other items aren't automated yet. */
/** A weapon readies its attack; a potion or other usable item is used at once. */
function readyItem(session: Session, token: TokenView, item: Item): void {
  const name = item.name;
  if (token.sheet?.attacks.some((a) => a.name === name)) session.arm(session.armed === name ? undefined : name);
  else if (item.type === 'gear' && item.use) session.useItem(token.id, item.id);
  else session.showError(`Using ${name} isn't automated yet: ask the GM`);
}

/** BG3-style bar along the bottom: portrait, resources, action tiles and end turn. */
export function ActionBar({ session, onSheet }: Readonly<{ session: Session; onSheet: () => void }>) {
  const token = session.selected ? session.tokens.get(session.selected) : undefined;
  return (
    <footer className="actionbar-wrap">
      <div className="hint">{hint(session, token)}</div>
      {token && <AimingControls session={session} token={token} />}
      {token && <SmiteControls session={session} token={token} />}
      {token && <Bar session={session} token={token} onSheet={onSheet} />}
    </footer>
  );
}

/** The painted bar: portrait in the left ring, end turn in the right one, everything else in the tray. */
function Bar({ session, token, onSheet }: Readonly<{ session: Session; token: TokenView; onSheet: () => void }>) {
  const [tab, setTab] = useState<Tab>('all');
  const budget = budgetOf(session, token);
  return (
    <div className="actionbar">
      <Portrait token={token} onSheet={onSheet} />
      <div className="ab-tray">
        <div className="ab-top">
          <Who session={session} token={token} />
          <Resources token={token} budget={budget} />
        </div>
        <div className="ab-body">
          <Tabs tab={tab} onTab={setTab} />
          <Grid session={session} token={token} tab={tab} budget={budget} />
        </div>
      </div>
      <EndTurn session={session} token={token} />
    </div>
  );
}

function Portrait({ token, onSheet }: Readonly<{ token: TokenView; onSheet: () => void }>) {
  return (
    <button className="ab-portrait" onClick={onSheet} title="Character sheet (C)" disabled={!token.sheet}>
      <Face token={token} />
      {token.sheet && (
        <span className="ab-ac" title="Armor class">
          {token.sheet.ac}
        </span>
      )}
    </button>
  );
}

function Who({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  return (
    <div className="ab-who">
      {session.canEdit(token.id) ? (
        <button
          className="ab-name ab-edit"
          title="Edit sheet (E)"
          onClick={() => session.openSheet({ kind: 'token', id: token.id }, true)}
        >
          {token.name} ✎
        </button>
      ) : (
        <div className="ab-name">{token.name}</div>
      )}
      <HpBar token={token} />
      <EffectBadges token={token} />
    </div>
  );
}

function Tabs({ tab, onTab }: Readonly<{ tab: Tab; onTab: (tab: Tab) => void }>) {
  return (
    <div className="ab-tabs" role="tablist">
      {TABS.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={t === tab}
          className={t === tab ? 'ab-tab on' : 'ab-tab'}
          title={TAB_LABEL[t]}
          onClick={() => onTab(t)}
        >
          <Glyph glyph={TAB_GLYPH[t]} size={14} />
        </button>
      ))}
    </div>
  );
}

function Grid({
  session,
  token,
  tab,
  budget,
}: Readonly<{ session: Session; token: TokenView; tab: Tab; budget: TurnBudget | undefined }>) {
  if (tab === 'all') return <Hotbar session={session} token={token} budget={budget} />;
  const shown = filterTiles(actionTiles(token), tab);
  return (
    <div className="ab-grid">
      {shown.map((tile) => (
        <Tile key={`${tile.kind}-${tile.name}`} session={session} token={token} tile={tile} budget={budget} />
      ))}
      {Array.from({ length: Math.max(0, MIN_TILES - shown.length) }, (_, i) => (
        <span key={`empty-${i}`} className="tile empty" />
      ))}
    </div>
  );
}

/** Slots without the empty ones at the end, as saved on the token. */
function trimmed(slots: Slots): Slots {
  const last = slots.findLastIndex((s) => s !== null);
  return slots.slice(0, last + 1);
}

function slotBox(e: React.DragEvent): Element {
  return e.currentTarget.firstElementChild ?? e.currentTarget;
}

/** The arranged bar: drop tiles from the sheet onto any slot, drag tiles to swap them. */
function Hotbar({
  session,
  token,
  budget,
}: Readonly<{ session: Session; token: TokenView; budget: TurnBudget | undefined }>) {
  const save = (slots: Slots) => session.setHotbar(token.id, trimmed(slots));
  const onDrop = (i: number) => (e: React.DragEvent) => {
    const data = e.dataTransfer.getData(TILE_DRAG);
    if (!data) return;
    e.preventDefault();
    // Slots are display: contents, so the tile inside has the box.
    const box = slotBox(e);
    box.classList.remove('drop-target');
    landOn(box);
    const drag = JSON.parse(data) as TileDrag;
    const slots = hotbarSlots(token, session.macroOf);
    save('ref' in drag ? placeOnHotbar(slots, drag.ref, i) : moveOnHotbar(slots, drag.from, i));
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(TILE_DRAG)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    slotBox(e).classList.add('drop-target');
  };
  const onDragLeave = (e: React.DragEvent) => {
    const box = slotBox(e);
    if (!box.contains(e.relatedTarget as Node | null)) box.classList.remove('drop-target');
  };
  return (
    <div className="ab-grid">
      {hotbarTiles(token, session.macroOf).map((tile, i) => (
        <span key={i} className="ab-slot" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop(i)}>
          {tile ? (
            <Tile
              session={session}
              token={token}
              tile={tile}
              budget={budget}
              onDragStart={(e) => dragTile(e, { from: i })}
              // An item or macro dragged off the bar leaves it.
              onDragEnd={(e) =>
                e.dataTransfer.dropEffect === 'none' &&
                (tile.kind === 'item' || tile.kind === 'macro') &&
                save(removeFromHotbar(hotbarSlots(token, session.macroOf), i))
              }
            />
          ) : (
            <span className="tile empty" />
          )}
        </span>
      ))}
    </div>
  );
}

function isActive(session: Session, tile: ActionTile): boolean {
  if (tile.kind === 'attack') return session.armed === tile.name;
  return tile.kind === 'spell' && session.aiming?.spell.id === tile.spell.id;
}

function tipFor(tile: ActionTile) {
  if (tile.kind === 'attack') return attackTip(tile.attack);
  if (tile.kind === 'spell') return spellTip(tile.spell);
  if (tile.kind === 'item') return itemTip(tile.item, tile.item.id, false);
  if (tile.kind === 'macro') return macroTip(tile.macro);
  return featureTip(tile.feature);
}

function Tile({
  session,
  token,
  tile,
  budget,
  onDragStart,
  onDragEnd,
}: Readonly<{
  session: Session;
  token: TokenView;
  tile: ActionTile;
  budget: TurnBudget | undefined;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}>) {
  const usable = !tile.spent && affordable(tile, budget);
  const cls = ['tile', `cost-${costOf(tile)}`, isActive(session, tile) && 'active', !usable && 'unusable'];
  return (
    <button
      className={cls.filter(Boolean).join(' ')}
      disabled={!canActivate(tile)}
      aria-label={tile.name}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => activateTile(session, token, tile)}
    >
      <IconFace icon={tile.icon} size={26} />
      <span className="tile-cost" />
      {tile.hotkey && <span className="tile-key">{tile.hotkey}</span>}
      <TileCorner tile={tile} />
      <TipCard tip={tipFor(tile)} />
    </button>
  );
}

/** Spell level, or uses left, in the tile's top-right corner. */
function TileCorner({ tile }: Readonly<{ tile: ActionTile }>) {
  if (tile.kind === 'spell')
    return <span className="tile-level">{tile.scroll ? tile.uses : tile.spell.level || ''}</span>;
  if (tile.kind === 'feature' && tile.uses) return <span className="tile-level">{tile.feature.left}</span>;
  if (tile.kind === 'item' && tile.uses) return <span className="tile-level">{tile.uses}</span>;
  return null;
}

/** Action, bonus action and movement on your turn, then spell slots. */
function Resources({ token, budget }: Readonly<{ token: TokenView; budget: TurnBudget | undefined }>) {
  const caster = token.sheet?.caster;
  const speed = token.sheet?.speed ?? token.speed;
  return (
    <div className="ab-resources">
      <span className={budget && !budget.action ? 'res res-action used' : 'res res-action'} title="Action" />
      <span className={budget && !budget.bonus ? 'res res-bonus used' : 'res res-bonus'} title="Bonus action" />
      <span className="res-move-icon" title="Movement left" />
      <span className="res-move" title="Movement left">
        <span
          className="res-move-fill"
          style={{ width: `${budget ? (budget.move / Math.max(1, speed)) * 100 : 100}%` }}
        />
        <span className="res-move-label">{budget ? budget.move : speed} ft</span>
      </span>
      {caster?.slots.map((n, i) =>
        n ? (
          <span key={i} className="res-slots" title={`${ORDINAL[i + 1]}-level spell slots`}>
            <span className="res-slots-level">{i + 1}</span>
            {Array.from({ length: n }, (_, k) => (
              <span key={k} className={k < caster.left[i]! ? 'res-slot' : 'res-slot used'} />
            ))}
          </span>
        ) : null,
      )}
    </div>
  );
}

function EndTurn({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const combat = session.combat;
  if (!combat) return <div className="ab-end" />;
  const mine = session.isMyTurn() && (session.turnToken()?.id === token.id || !!combat.side[token.id]);
  return (
    <div className="ab-end">
      <button
        className="end-turn"
        disabled={!mine}
        onClick={() => session.endTurn()}
        title={mine ? 'End turn (Space)' : 'Waiting for your turn'}
        aria-label={mine ? 'End turn' : 'Waiting for your turn'}
      />
    </div>
  );
}

/** The slot levels a spell can be cast with, how many of each are left, and casting it for free. */
function SlotChoices({
  session,
  aiming,
  caster,
}: Readonly<{ session: Session; aiming: Aiming; caster: { slots: number[]; left: number[] } }>) {
  const { spell, free } = aiming;
  const choices = slotChoices(spell, caster).filter((c) => free === true || c.left > 0);
  const backToSlots = () => {
    session.setFreeCast(false);
    const current = choices.find((c) => c.level === aiming.slot);
    const first = choices.find((c) => c.left > 0);
    if (!current?.left && first) session.aim(spell.id, first.level);
  };
  return (
    <span className="slot-choices" role="group" aria-label="Spell slot">
      <span className="slot-choices-label">Slot</span>
      {choices.map((c) => (
        <Toggle
          key={c.level}
          pressed={c.level === aiming.slot}
          onPressedChange={() => session.aim(spell.id, c.level, free)}
          title={free ? `Cast at ${ORDINAL[c.level]} level for free` : `Use a ${ORDINAL[c.level]}-level slot`}
        >
          {ORDINAL[c.level]}
          {!free && <span className="slot-chip-left">{`${c.left}/${c.total}`}</span>}
        </Toggle>
      ))}
      <Toggle
        pressed={free}
        onPressedChange={() => (free ? backToSlots() : session.setFreeCast(true))}
        title="Cast without spending a spell slot"
      >
        Free
      </Toggle>
    </span>
  );
}

function hint(session: Session, token: TokenView | undefined): string {
  if (session.armed) return `Click a target for ${session.armed} · right click or Esc to cancel`;
  const aiming = session.aiming;
  if (aiming?.mode === 'point') return `Click where ${aiming.spell.name} goes · right click or Esc to cancel`;
  if (aiming)
    return `Click ${aiming.need - aiming.picks.length} more target(s) for ${aiming.spell.name} · right click or Esc to cancel`;
  if (!token) return 'Click one of your characters to select them';
  return 'Click the ground to walk · Right click for more · 1–0 for actions · C for the sheet · Space ends your turn';
}

/** While a spell is aimed: which slot to cast it with, what to summon, and casting with fewer targets. */
function AimingControls({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const aiming = session.aiming;
  if (!aiming) return null;
  const { spell } = aiming;
  return (
    <div className="aiming frame">
      <span className="aiming-name">{spell.name}</span>
      {aiming.scroll && <span className="muted">from a scroll</span>}
      {spell.level > 0 && !aiming.scroll && token.sheet?.caster && (
        <SlotChoices session={session} aiming={aiming} caster={token.sheet.caster} />
      )}
      {spell.summon && (
        <SelectField
          value={aiming.summon ?? ''}
          aria-label="What to summon"
          onValueChange={(m) => session.chooseSummon(m)}
          options={spell.summon.options.map((o) => ({
            value: o.monster,
            label: o.count > 1 ? `${o.count} × ${o.monster}` : o.monster,
          }))}
        />
      )}
      {aiming.mode === 'creatures' && aiming.picks.length > 0 && (
        <Button size="sm" onClick={() => session.confirmCast()}>
          Cast at {aiming.picks.length}
        </Button>
      )}
    </div>
  );
}
