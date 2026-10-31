import type { Attack, FeatureSheet, Item, Spell, TokenView, TurnBudget } from '@vtt/shared';
import { attackArt, featureArt, spellArt } from './icon-art.ts';
import { attackIcon, featureIcon, spellIcon, type Icon } from './icons.ts';
import { lowestSlot } from './spell-text.ts';

// The tiles on the action bar: what the selected creature can do, in hotkey order.

interface TileBase {
  name: string;
  icon: Icon;
  /** "1".."9", "0" for the first ten tiles. */
  hotkey?: string;
  /** Nothing left to use it with: no slot, no uses. */
  spent: boolean;
}

export type ActionTile =
  | (TileBase & { kind: 'attack'; attack: Attack })
  | (TileBase & { kind: 'spell'; spell: Spell; slot: number | undefined })
  | (TileBase & { kind: 'feature'; feature: FeatureSheet; uses?: string })
  /** An item put on the bar by hand; `uses` is how many are carried. */
  | (TileBase & { kind: 'item'; item: Item; uses?: string; cost?: 'action' | 'bonus' });

export type Cost = 'action' | 'bonus' | 'reaction' | 'free' | 'long';

export const TABS = ['all', 'attacks', 'spells', 'features'] as const;
export type Tab = (typeof TABS)[number];

const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

function attackTiles(token: TokenView): ActionTile[] {
  return (token.sheet?.attacks ?? []).map((attack) => ({
    kind: 'attack',
    name: attack.name,
    icon: { ...attackIcon(attack), art: attackArt(attack) },
    spent: false,
    attack,
  }));
}

function spellTiles(token: TokenView): ActionTile[] {
  const spells = [...(token.sheet?.caster?.spells ?? [])].sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name),
  );
  return spells.map((spell) => {
    const slot = lowestSlot(token, spell);
    return {
      kind: 'spell',
      name: spell.name,
      icon: { ...spellIcon(spell), art: spellArt(spell) },
      spent: slot === undefined,
      spell,
      slot,
    };
  });
}

function featureTiles(token: TokenView): ActionTile[] {
  return (token.sheet?.features ?? [])
    .filter((f) => f.action)
    .map((feature) => ({
      kind: 'feature',
      name: feature.name,
      icon: { ...featureIcon(feature), art: featureArt(feature) },
      spent: feature.left === 0,
      feature,
      ...(feature.max === undefined ? {} : { uses: `${feature.left}/${feature.max}` }),
    }));
}

export function actionTiles(token: TokenView): ActionTile[] {
  const tiles = [...attackTiles(token), ...spellTiles(token), ...featureTiles(token)];
  return tiles.map((t, i) => (i < HOTKEYS.length ? { ...t, hotkey: HOTKEYS[i] } : t));
}

const TAB_KIND: Record<Exclude<Tab, 'all'>, ActionTile['kind']> = {
  attacks: 'attack',
  spells: 'spell',
  features: 'feature',
};

export function filterTiles(tiles: ActionTile[], tab: Tab): ActionTile[] {
  return tab === 'all' ? tiles : tiles.filter((t) => t.kind === TAB_KIND[tab]);
}

export function costOf(tile: ActionTile): Cost {
  if (tile.kind === 'item') return tile.cost ?? 'action';
  if (tile.kind === 'attack') return tile.attack.offHand ? 'bonus' : 'action';
  if (tile.kind === 'feature') return tile.feature.action ?? 'free';
  const time = tile.spell.castingTime;
  return time === 'minute' || time === 'hour' ? 'long' : time;
}

/** On your turn, whether you still have what the tile costs; always true otherwise. */
export function affordable(tile: ActionTile, left: TurnBudget | undefined): boolean {
  if (!left) return true;
  const cost = costOf(tile);
  if (cost === 'bonus') return left.bonus;
  if (cost !== 'action') return true;
  return left.action || (tile.kind === 'attack' && left.attacks > 0);
}
