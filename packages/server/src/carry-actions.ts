import { canControl, type Player } from '@vtt/shared';
import { attuneProblem, type CarryChange, putInside, stowProblem, type Token } from '@vtt/system-dnd5e';
import type { ClientMessage } from './client-messages.ts';
import { Refusal, type Table } from './table.ts';

// What an owner may do with their own gear without the GM's edit mode:
// equip it, count coins, pack things into containers, attune to magic items.

type GearMessage = Extract<ClientMessage, { t: 'equip' | 'carry' }>;

export function gearAction(table: Table, player: Player, msg: GearMessage): void {
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
