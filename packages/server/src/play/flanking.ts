import { gridKind, isParty, sameFloor } from '@vtt/shared';
import { canAct, flanks, gameSettingsOf, type Token, tokenDistance } from '@vtt/system-dnd5e';
import type { Table } from './table.ts';

/** Whether the game plays flanking and an ally that can act stands opposite `attacker`, both beside `target`. */
export function flanked(table: Table, attacker: Token, target: Token): boolean {
  const { world } = table.store;
  if (gameSettingsOf(world.settings).flanking !== 'on') return false;
  const near = (t: Token) => tokenDistance(t, target, world.gridSize, gridKind(world)) <= 5;
  if (!near(attacker)) return false;
  return [...table.store.tokens.values()].some((t) => {
    if (t.id === attacker.id || t.id === target.id || isParty(t) !== isParty(attacker)) return false;
    if (!sameFloor(world.levels, t, target) || !near(t) || !flanks(attacker, t, target)) return false;
    const sheet = table.sheetOf(t);
    return !!sheet && sheet.hp > 0 && canAct(sheet);
  });
}
