import { canControl, type Player } from '@vtt/shared';
import {
  attuneProblem,
  characterLevel,
  gainXp,
  levelForXp,
  type CarryChange,
  hitDieProblem,
  putInside,
  spendHitDie,
  stowProblem,
  type Token,
} from '@vtt/system-dnd5e';
import type { ClientMessage } from './client-messages.ts';
import { Refusal, requireGm, type Table } from './table.ts';

// What an owner may do on their sheet without the GM's edit mode: equip
// gear, count coins, pack things into containers, attune to magic items,
// spend hit dice; and the GM's exhaustion and experience awards.

type SheetMessage = Extract<ClientMessage, { t: 'equip' | 'carry' | 'hitDie' | 'exhaustion' | 'awardXp' }>;

export function isSheetMessage(msg: ClientMessage): msg is SheetMessage {
  return ['equip', 'carry', 'hitDie', 'exhaustion', 'awardXp'].includes(msg.t);
}

export function sheetAction(table: Table, player: Player, msg: SheetMessage): void {
  if (msg.t === 'hitDie' || msg.t === 'exhaustion') return vigour(table, player, msg);
  if (msg.t === 'awardXp') return awardXp(table, player, msg);
  const token = table.store.tokens.get(msg.token);
  if (!token || !canControl(token, player)) throw new Refusal('No such token');
  const change: CarryChange | { kind: 'equip'; item: number; on: boolean } =
    msg.t === 'equip' ? { kind: 'equip', item: msg.item, on: msg.equipped } : msg.change;
  table.store.setToken(changed(table, token, change));
}

function changed(
  table: Table,
  token: Token,
  change: CarryChange | { kind: 'equip'; item: number; on: boolean },
): Token {
  if (change.kind === 'coins') return { ...token, currency: change.currency };
  const list = token.inventory ?? [];
  if (!list[change.item]) throw new Refusal(`${token.name} has no such item`);
  if (change.kind === 'stow') return { ...token, inventory: stowed(table, token, change.item, change.into) };
  if (change.kind === 'equip') return { ...token, inventory: withFlag(list, change.item, 'equipped', change.on) };
  const problem = change.on ? attuneProblem(token, change.item, table.content(token)) : undefined;
  if (problem) throw new Refusal(problem);
  return { ...token, inventory: withFlag(list, change.item, 'attuned', change.on) };
}

/** The entry at `index` equipped or attuned; an unattuned entry drops the flag. */
function withFlag(
  list: NonNullable<Token['inventory']>,
  index: number,
  flag: 'equipped' | 'attuned',
  on: boolean,
): NonNullable<Token['inventory']> {
  return list.map((e, i) => {
    if (i !== index) return e;
    if (flag === 'equipped' || on) return { ...e, [flag]: on };
    const { attuned: _was, ...rest } = e;
    return rest;
  });
}

function stowed(table: Table, token: Token, item: number, into: number | null): Token['inventory'] {
  const list = token.inventory ?? [];
  if (into === null) return putInside(list, item, undefined);
  const problem = stowProblem(list, item, into, table.content(token));
  if (problem) throw new Refusal(problem);
  return putInside(list, item, into);
}

/** Spending a hit die (the token's owners, outside fights) and setting exhaustion (the GM). */
function vigour(table: Table, player: Player, msg: Extract<SheetMessage, { t: 'hitDie' | 'exhaustion' }>): void {
  const { token, sheet } = table.fighter(msg.token);
  if (msg.t === 'exhaustion') {
    requireGm(player);
    table.store.setToken({ ...token, exhaustion: msg.level || undefined });
    return;
  }
  if (!canControl(token, player)) throw new Refusal('No such token');
  const combat = table.store.combat;
  if (combat && !combat.peaceful) throw new Refusal('Hit dice are spent on a rest, not in a fight');
  const problem = hitDieProblem(token, sheet);
  if (problem) throw new Refusal(problem);
  const out = spendHitDie(token, sheet, table.rng);
  table.store.setToken(out.token);
  table.note(`${token.name} spends a hit die and regains ${out.healed} HP`);
}

/** The GM gives each named character `xp`, and says who has enough for a new level. */
function awardXp(table: Table, player: Player, msg: Extract<SheetMessage, { t: 'awardXp' }>): void {
  requireGm(player);
  const heroes = msg.tokens.map((id) => table.fighter(id).token);
  const other = heroes.find((t) => t.monster !== undefined || !characterLevel(t.stats));
  if (other) throw new Refusal(`Experience goes to characters, and ${other.name} isn't one`);
  for (const token of heroes) {
    const next = gainXp(token, msg.xp);
    table.store.setToken(next);
    const level = characterLevel(token.stats)!;
    const reach = levelForXp(next.stats!.xp!);
    const more = reach > level ? ` and can reach level ${reach}` : '';
    table.note(`${token.name} gains ${msg.xp} XP${more}`);
  }
}
