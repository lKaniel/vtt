import { randomUUID } from 'node:crypto';
import { canControl, type Player } from '@vtt/shared';
import { type ChatMessage, type CheckKind, type CheckLog, checkOutcome, rollCheck, skillName } from '@vtt/system-dnd5e';
import type { ClientMessage } from './client-messages.ts';
import { type Fighter, Refusal, requireGm, type Table } from './table.ts';

// Ability and skill checks in chat. An owner rolls one from the sheet; the
// GM asks creatures for one on a card each owner rolls on, which then says
// how a group check or a contest came out.

export type CheckMessage = Extract<ClientMessage, { t: 'requestCheck' | 'rollCheck' }>;

export const isCheckMessage = (msg: ClientMessage): msg is CheckMessage =>
  msg.t === 'requestCheck' || msg.t === 'rollCheck';

export interface CheckCards {
  readonly all: readonly ChatMessage[];
  post: (card: ChatMessage) => void;
  update: (card: ChatMessage) => void;
}

const card = (player: Player, check: CheckLog): ChatMessage => ({
  id: randomUUID(),
  time: Date.now(),
  from: player.name,
  color: player.color,
  by: player.id,
  text: checkTitle(check),
  check,
});

function checkTitle(check: CheckKind & { dc?: number }): string {
  const what = check.skill ? skillName(check.skill) : `${check.ability.toUpperCase()} check`;
  return check.dc ? `${what} (DC ${check.dc})` : what;
}

export function checkAction(table: Table, cards: CheckCards, player: Player, msg: CheckMessage): void {
  if (msg.t === 'requestCheck') return request(table, cards, player, msg);
  const fighter = table.fighter(msg.token);
  if (!canControl(fighter.token, player)) throw new Refusal('No such token');
  if (msg.card) return rollOnCard(table, cards, fighter, msg.card);
  const { token, sheet } = fighter;
  const entry = { token: token.id, name: token.name, ...rollCheck(token, sheet, msg, table.rng) };
  cards.post(card(player, { ability: msg.ability, skill: msg.skill, kind: 'each', entries: [entry] }));
}

/** The creature's roll on the GM's request card, which then tells how a group check or contest went. */
function rollOnCard(table: Table, cards: CheckCards, { token, sheet }: Fighter, id: string): void {
  const before = cards.all.find((m) => m.id === id);
  const asked = before?.check;
  const at = asked?.entries.findIndex((e) => e.token === token.id) ?? -1;
  if (!before || !asked || at < 0) throw new Refusal(`${token.name} wasn't asked for that check`);
  if (asked.entries[at]!.total !== undefined) throw new Refusal(`${token.name} has already rolled`);
  const kind = asked.kind === 'contest' && at === 1 && asked.versus ? asked.versus : asked;
  const rolled = rollCheck(token, sheet, { ...kind, dc: asked.dc }, table.rng);
  const entries = asked.entries.map((e, i) => (i === at ? { ...e, ...rolled } : e));
  const outcome = checkOutcome(asked.kind, entries);
  cards.update({ ...before, check: { ...asked, entries, ...(outcome && { outcome }) } });
}

function request(
  table: Table,
  cards: CheckCards,
  player: Player,
  msg: Extract<CheckMessage, { t: 'requestCheck' }>,
): void {
  requireGm(player);
  if (msg.kind === 'contest' && msg.tokens.length !== 2) throw new Refusal('A contest is between two creatures');
  const entries = [...new Set(msg.tokens)].map((id) => {
    const { token } = table.fighter(id);
    return { token: token.id, name: token.name };
  });
  const { t: _t, tokens: _tokens, ...check } = msg;
  cards.post(card(player, { ...check, entries }));
}
