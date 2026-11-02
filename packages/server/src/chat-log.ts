import { randomUUID } from 'node:crypto';
import { chatFor, type Player, type RollMode, withMode } from '@vtt/shared';
import type { ChatMessage, ServerMessage } from '@vtt/system-dnd5e';
import { chatMessage } from './chat-command.ts';

// The game's chat: the last 200 messages, sent to everyone allowed to read
// each one, and cards the game itself posts (initiative, attacks, time).

const CHAT_HISTORY = 200;

interface Seat {
  player: Player;
  /** Who sees its rolls (see roll-modes.ts); none: everyone. */
  rollMode?: RollMode;
}

export class ChatLog<C extends Seat> {
  private messages: ChatMessage[] = [];

  constructor(
    private seats: () => Iterable<C>,
    private send: (seat: C, msg: ServerMessage) => void,
  ) {}

  get all(): readonly ChatMessage[] {
    return this.messages;
  }

  /** What a player typed; a message (thrown) when it can't be read. */
  say(seat: C, text: string): void {
    if (text) this.post(chatMessage(seat.player, text, seat.rollMode));
  }

  /** Adds a message to the log and sends each seat what it may read of it (see roll-modes.ts). */
  post(message: ChatMessage): void {
    this.messages.push(message);
    if (this.messages.length > CHAT_HISTORY) this.messages.shift();
    for (const other of this.seats()) {
      const shown = chatFor(message, other.player);
      if (shown) this.send(other, { t: 'chat', message: shown });
    }
  }

  /** The GM undid (or redid) the action these cards report. */
  undone(ids: string[], undone: boolean): void {
    for (const m of this.messages) if (ids.includes(m.id)) m.undone = undone || undefined;
    for (const c of this.seats()) this.send(c, { t: 'chatUndone', ids, undone });
  }
}

/** A card of an action `seat` is taking (none: the game's own): shown as that seat rolls (see roll-modes.ts). */
export function actedBy(card: ChatMessage, seat: Seat | undefined): ChatMessage {
  if (!seat) return card;
  return card.mode ? { ...card, by: seat.player.id } : withMode(card, seat.rollMode ?? 'public', seat.player.id);
}

/** A chat card from the game itself, part of the action being recorded. */
export function gameCard(text: string, gmOnly = false): ChatMessage {
  return {
    id: randomUUID(),
    time: Date.now(),
    from: 'Combat',
    color: '#c8b48a',
    text,
    ...(gmOnly && { mode: 'gm' as const }),
  };
}
