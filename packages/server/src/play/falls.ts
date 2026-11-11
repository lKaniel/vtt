import { applyDamage, keepsAloft, type Token, withGravity } from '@vtt/system-dnd5e';
import { levelAt, roll } from '@vtt/shared';
import type { Table } from './table.ts';

// Creatures a spell lifted (reverse gravity) rise while it lasts and fall
// when it ends; on a flat scene a creature in the air that loses its flight
// falls to its floor (a 3D scene's ground is the client's to know). Only one
// seen flying before falls: one set high by hand, or standing on something,
// stays. 1d6 bludgeoning
// per 10 ft, at most 20d6, and it lands prone.

/** Raises or drops every token to what its effects lift it now, hurting the ones that fall. */
export function keepGravity(table: Table): void {
  for (const token of [...table.store.tokens.values()]) {
    const next = withGravity(token);
    if (!next) continue;
    table.store.setToken(next.token);
    if (next.fell) fall(table, next.token.id, next.fell);
  }
  if (table.store.world.view !== '3d') dropFlightless(table);
}

/** The floor under a token: the bottom of the level it is on, else the ground. */
function floorUnder(table: Table, token: Token): number {
  return levelAt(table.store.world.levels, token.elevation ?? 0)?.bottom ?? 0;
}

/** The creatures in the air that could fly at the last step, per game. */
const flyers = new WeakMap<Table, Set<string>>();

/** Brings down every creature in the air that has lost its flight since the last step. */
function dropFlightless(table: Table): void {
  const before = flyers.get(table) ?? new Set<string>();
  const now = new Set<string>();
  for (const token of [...table.store.tokens.values()]) {
    const floor = floorUnder(table, token);
    const height = (token.elevation ?? 0) - floor;
    const sheet = height > 0 ? table.sheetOf(token) : undefined;
    if (!sheet) continue;
    if (keepsAloft(token, sheet)) now.add(token.id);
    else if (before.has(token.id)) land(table, token, floor, height);
  }
  flyers.set(table, now);
}

function land(table: Table, token: Token, floor: number, height: number): void {
  table.store.setToken({ ...token, elevation: floor || undefined });
  fall(table, token.id, height);
}

function fall(table: Table, id: string, feet: number): void {
  const token = table.store.tokens.get(id)!;
  const sheet = table.sheetOf(token);
  const dice = Math.min(20, Math.floor(feet / 10));
  if (!sheet || dice < 1) return;
  const amount = roll(`${dice}d6`, table.rng).total;
  const { dealt, hp, tempHp, warded } = applyDamage(sheet, [{ amount, type: 'bludgeoning' }], table.rng);
  const total = dealt.reduce((n, d) => n + d, 0);
  table.note(`${token.name} falls ${feet} ft and takes ${total} bludgeoning damage`);
  if (total > 0) table.hurt(token, { hp, tempHp, warded }, total);
  landProne(table, id);
}

function landProne(table: Table, id: string): void {
  const token = table.store.tokens.get(id);
  if (!token || (token.effects ?? []).some((e) => e.conditions?.includes('prone'))) return;
  const prone = { id: `fall-prone-${id}`, name: 'Prone', conditions: ['prone' as const] };
  table.store.setToken({ ...token, effects: [...(token.effects ?? []), prone] });
}
