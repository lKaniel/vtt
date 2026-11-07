import { gridKind } from '@vtt/shared';
import { counterers, counterOutcome, type CounterOutcome, counterSlot, type Token } from '@vtt/system-dnd5e';
import type { PendingCast } from '../actions/spell-actions.ts';
import type { Table } from './table.ts';

// Counterspell at the table: who may answer a spell being cast, and what
// happens when one of them does.

/** The enemies of the caster who could counter its spell now. */
export function spellAnswerers(table: Table, cast: PendingCast, reacted: readonly string[]): Token[] {
  const { world, tokens } = table.store;
  const others = [...tokens.values()].flatMap((token) => {
    const sheet = table.sheetOf(token);
    return sheet ? [{ token, sheet }] : [];
  });
  const scale = { gridSize: world.gridSize, grid: gridKind(world) };
  return counterers({ caster: cast.caster, others, reacted, ...scale }).map((c) => c.token);
}

/** `reactor` casts counterspell on the cast: it spends its reaction and slot, then the cast fails or goes on. */
export function counter(table: Table, reactor: string, cast: PendingCast): void {
  const by = table.fighter(reactor);
  const slot = counterSlot(by.sheet, cast.slot);
  if (!slot) return cast.go();
  table.pay(by.token, 'reaction');
  table.spendSlot(by.token.id, slot);
  const of = table.fighter(cast.caster.token.id);
  const result = counterOutcome({ by, of, slot, level: cast.slot }, table.rng);
  table.note(`${by.token.name} casts Counterspell on ${of.token.name}'s ${cast.spell.name}${rolled(result)}`);
  if (result.countered) cast.fail(!!result.keepsSlot);
  else cast.go();
}

function rolled({ check, save }: CounterOutcome): string {
  if (check) return ` (check ${check.total} vs DC ${check.dc})`;
  if (save) return ` (Constitution save ${save.total} vs DC ${save.dc})`;
  return '';
}
