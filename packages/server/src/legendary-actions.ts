import { type Player } from '@vtt/shared';
import { currentTurn, legendaryProblem, spendLegendary } from '@vtt/system-dnd5e';
import type { ClientMessage } from './client-messages.ts';
import { Refusal, requireGm, type Fighter, type Table } from './table.ts';

// The GM's legendary and lair actions. A legendary action spends from the
// creature's pool between other creatures' turns: it makes its attack, or is
// described in chat for the GM to resolve. A lair action is described on the
// lair's turn at initiative 20.

export type LegendaryMessage = Extract<ClientMessage, { t: 'legendary' | 'lair' }>;

/** Messages about the fight's turns that the combat actions route: turn-based mode, legendary and lair actions. */
export type TurnMessage = LegendaryMessage | Extract<ClientMessage, { t: 'turnBased' }>;

export const isTurnMessage = (msg: ClientMessage): msg is TurnMessage =>
  msg.t === 'turnBased' || msg.t === 'legendary' || msg.t === 'lair';

/** Makes a legendary action's attack outside the creature's turn. */
export type LegendaryAttack = (attacker: Fighter, target: string, attack: string) => void;

export function legendaryAction(table: Table, player: Player, msg: LegendaryMessage, attack: LegendaryAttack): void {
  requireGm(player);
  const { token, sheet } = table.fighter(msg.token);
  if (msg.t === 'lair') return lairAction(table, msg);
  const problem = legendaryProblem(token, sheet, table.store.combat, msg.option);
  if (problem) throw new Refusal(problem);
  const option = sheet.legendary!.options.find((o) => o.id === msg.option)!;
  if (option.attack && !msg.target) throw new Refusal(`Target a creature for ${option.name} first`);
  table.store.setToken(spendLegendary(token, option.cost));
  table.note(`${token.name} takes a legendary action, ${option.name}${option.attack ? '' : said(option.description)}`);
  if (option.attack) attack({ token: table.store.tokens.get(token.id)!, sheet }, msg.target!, option.attack);
}

function lairAction(table: Table, msg: Extract<LegendaryMessage, { t: 'lair' }>): void {
  const { token, sheet } = table.fighter(msg.token);
  const combat = table.store.combat;
  if (!combat || currentTurn(combat) !== `lair:${token.id}`) throw new Refusal(`It isn't ${token.name}'s lair's turn`);
  const action = sheet.lair?.actions.find((a) => a.id === msg.action);
  if (!action) throw new Refusal(`${token.name}'s lair has no such action`);
  table.note(`Lair action, ${action.name}${said(action.description)}`);
}

const said = (description: string | undefined): string => (description ? ': ' + description : '');
