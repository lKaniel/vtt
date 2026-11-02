import type { FeatureSheet, Item, TokenView } from '@vtt/system-dnd5e';
import type { ActionTile } from './actions.ts';
import type { Session } from './session.ts';

// Using an action bar tile, by click or by its hotkey (game-keys.ts).

/** Does what a tile says: readies an attack, aims a spell, or uses a feature. */
export function activateTile(session: Session, token: TokenView, tile: ActionTile): void {
  if (tile.kind === 'attack') session.actions.arm(session.actions.armed === tile.name ? undefined : tile.name);
  else if (tile.kind === 'spell') aimTile(session, tile);
  else if (tile.kind === 'feature') activateFeature(session, token, tile.feature);
  else if (tile.kind === 'macro') void session.journal.runMacro(tile.macro.id, token.id);
  else readyItem(session, token, tile.item);
}

/** A feature aimed like a spell waits for its targets; any other goes off at once. */
function activateFeature(session: Session, token: TokenView, feature: FeatureSheet): void {
  if (!feature.spell) return session.useFeature(token.id, feature.id);
  session.actions.aimFeature(session.actions.aiming?.feature === feature.id ? undefined : feature.id);
}

/** A spell with no slot left can still be cast for free. */
export function canActivate(tile: ActionTile): boolean {
  return !tile.spent || tile.kind === 'spell';
}

function aimTile(session: Session, tile: Extract<ActionTile, { kind: 'spell' }>): void {
  if (session.actions.aiming?.spell.id === tile.spell.id) return session.actions.aim(undefined);
  if (tile.scroll) return session.actions.aimScroll(tile.spell.id);
  session.actions.aim(tile.spell.id, tile.slot ?? tile.spell.level, tile.slot === undefined && tile.spell.level > 0);
}

/** A weapon readies its attack; a potion or other usable item is used at once. */
function readyItem(session: Session, token: TokenView, item: Item): void {
  const name = item.name;
  if (token.sheet?.attacks.some((a) => a.name === name))
    session.actions.arm(session.actions.armed === name ? undefined : name);
  else if (item.type === 'gear' && item.use) session.useItem(token.id, item.id);
  else session.showError(`Using ${name} isn't automated yet: ask the GM`);
}
