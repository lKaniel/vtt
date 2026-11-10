import { isParty } from '@vtt/shared';
import { type Combat, unawareOf } from '@vtt/system-dnd5e';
import type { Fighter, Table } from './table.ts';

// Who is surprised as a fight starts (system-dnd5e surprise.ts) and the turn
// a 2014 surprised creature loses.

export interface Surprise {
  /** Roll initiative with disadvantage (2024). */
  slow: Set<string>;
  /** Lose their first turn and can't react until it ends (2014). */
  stunned: string[];
}

/** The fighters who notice no foe, and those the GM names, split by their rules. */
export function surpriseOf(fighters: readonly Fighter[], named: readonly string[] = []): Surprise {
  const sides = fighters.map((f) => ({ ...f, party: isParty(f.token) }));
  const ids = new Set([...unawareOf(sides), ...named.filter((id) => fighters.some((f) => f.token.id === id))]);
  const surprised = fighters.filter((f) => ids.has(f.token.id));
  return {
    slow: new Set(surprised.filter((f) => f.sheet.edition === '2024').map((f) => f.token.id)),
    stunned: surprised.filter((f) => f.sheet.edition !== '2024').map((f) => f.token.id),
  };
}

/** The fight as it opens: the 2014 surprised listed, their reactions already gone. */
export function withSurprise(combat: Combat, { stunned }: Surprise): Combat {
  if (!stunned.length) return combat;
  return { ...combat, surprised: stunned, reacted: [...combat.reacted, ...stunned] };
}

/** As a surprised creature's first turn starts: it can't move or act, and is no longer surprised. */
export function surprisedTurn(table: Table, id: string): void {
  const combat = table.store.combat;
  if (!combat?.surprised?.includes(id)) return;
  const left = combat.surprised.filter((s) => s !== id);
  table.store.setCombat({ ...combat, surprised: left.length ? left : undefined });
  const token = table.store.tokens.get(id);
  const budget = token && table.budget(token);
  if (!token || !budget) return;
  table.setBudget(token, { ...budget, move: 0, action: false, bonus: false, attacks: 0 });
  table.note(`${token.name} is surprised and loses this turn`);
}
