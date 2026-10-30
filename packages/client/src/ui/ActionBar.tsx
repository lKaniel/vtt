import type { TokenView, TurnBudget } from '@vtt/shared';
import { useState } from 'react';
import { actionTiles, affordable, costOf, filterTiles, TABS, type ActionTile, type Tab } from '../actions.ts';
import type { Glyph as GlyphName } from '../icons.ts';
import type { Session } from '../session.ts';
import { ORDINAL } from '../spell-text.ts';
import { attackTip, featureTip, spellTip } from '../tooltip.ts';
import { Glyph, IconFace } from './Icon.tsx';
import { EffectBadges, Face, HpBar } from './Portrait.tsx';
import { TipCard } from './Tip.tsx';

const MIN_TILES = 12;

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
  else if (tile.kind === 'spell')
    session.aim(session.aiming?.spell.id === tile.spell.id ? undefined : tile.spell.id, tile.slot);
  else session.useFeature(token.id, tile.feature.id);
}

/** BG3-style bar along the bottom: portrait, resources, action tiles and end turn. */
export function ActionBar({ session, onSheet }: Readonly<{ session: Session; onSheet: () => void }>) {
  const token = session.selected ? session.tokens.get(session.selected) : undefined;
  return (
    <footer className="actionbar-wrap">
      <div className="hint">{hint(session, token)}</div>
      {token && <AimingControls session={session} token={token} />}
      {token && <Bar session={session} token={token} onSheet={onSheet} />}
    </footer>
  );
}

/** A strip of name, health, tabs and resources over the painted base that holds the tiles. */
function Bar({ session, token, onSheet }: Readonly<{ session: Session; token: TokenView; onSheet: () => void }>) {
  const [tab, setTab] = useState<Tab>('all');
  const budget = budgetOf(session, token);
  return (
    <div className="actionbar">
      <div className="ab-top">
        <Who token={token} />
        <Tabs tab={tab} onTab={setTab} />
        <Resources token={token} budget={budget} />
      </div>
      <div className="ab-base">
        <Portrait token={token} onSheet={onSheet} />
        <Grid session={session} token={token} tab={tab} budget={budget} />
        <EndTurn session={session} token={token} />
      </div>
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

function Who({ token }: Readonly<{ token: TokenView }>) {
  return (
    <div className="ab-who">
      <div className="ab-name">{token.name}</div>
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

function isActive(session: Session, tile: ActionTile): boolean {
  if (tile.kind === 'attack') return session.armed === tile.name;
  return tile.kind === 'spell' && session.aiming?.spell.id === tile.spell.id;
}

function tipFor(tile: ActionTile) {
  if (tile.kind === 'attack') return attackTip(tile.attack);
  if (tile.kind === 'spell') return spellTip(tile.spell);
  return featureTip(tile.feature);
}

function Tile({
  session,
  token,
  tile,
  budget,
}: Readonly<{ session: Session; token: TokenView; tile: ActionTile; budget: TurnBudget | undefined }>) {
  const usable = !tile.spent && affordable(tile, budget);
  const cls = ['tile', `cost-${costOf(tile)}`, isActive(session, tile) && 'active', !usable && 'unusable'];
  return (
    <button
      className={cls.filter(Boolean).join(' ')}
      disabled={tile.spent}
      aria-label={tile.name}
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
  if (tile.kind === 'spell') return <span className="tile-level">{tile.spell.level || ''}</span>;
  if (tile.kind === 'feature' && tile.uses) return <span className="tile-level">{tile.feature.left}</span>;
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
      <button className="end-turn" disabled={!mine} onClick={() => session.endTurn()} title="End turn (Space)">
        <span>{mine ? 'End' : 'Wait'}</span>
        <span>{mine ? 'turn' : ''}</span>
      </button>
    </div>
  );
}

function hint(session: Session, token: TokenView | undefined): string {
  if (session.armed) return `Click a target for ${session.armed} · Esc or click the ground to cancel`;
  const aiming = session.aiming;
  if (aiming?.mode === 'point') return `Click where ${aiming.spell.name} goes · Esc to cancel`;
  if (aiming)
    return `Click ${aiming.need - aiming.picks.length} more target(s) for ${aiming.spell.name} · Esc to cancel`;
  if (!token) return 'Click one of your characters to select them';
  return 'Click to walk · 1–0 for actions · C for the sheet · Space ends your turn';
}

/** While a spell is aimed: which slot to cast it with, what to summon, and casting with fewer targets. */
function AimingControls({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const aiming = session.aiming;
  const left = token.sheet?.caster?.left ?? [];
  if (!aiming) return null;
  const { spell } = aiming;
  const levels = left.map((_, i) => i + 1).filter((l) => l >= spell.level && left[l - 1]! > 0);
  return (
    <div className="aiming frame">
      <span className="aiming-name">{spell.name}</span>
      {spell.level > 0 &&
        levels.map((l) => (
          <button key={l} className={l === aiming.slot ? 'chip on' : 'chip'} onClick={() => session.aim(spell.id, l)}>
            {ORDINAL[l]}
          </button>
        ))}
      {spell.summon && (
        <select value={aiming.summon} onChange={(e) => session.chooseSummon(e.target.value)}>
          {spell.summon.options.map((o) => (
            <option key={o.monster} value={o.monster}>
              {o.count > 1 ? `${o.count} × ` : ''}
              {o.monster}
            </option>
          ))}
        </select>
      )}
      {aiming.mode === 'creatures' && aiming.picks.length > 0 && (
        <button className="chip on" onClick={() => session.confirmCast()}>
          Cast at {aiming.picks.length}
        </button>
      )}
    </div>
  );
}
