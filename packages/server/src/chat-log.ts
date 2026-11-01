import { randomUUID } from 'node:crypto';
import { isGm, type Player } from '@vtt/shared';
import type { ChatMessage, ServerMessage } from '@vtt/system-dnd5e';
import { chatMessage } from './chat-command.ts';

// The game's chat: the last 200 messages, sent to everyone allowed to read
// each one, and cards the game itself posts (initiative, attacks, time).

const CHAT_HISTORY = 200;

interface Seat {
  player: Player;
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
    if (text) this.post(chatMessage(seat.player, text), seat);
  }

  /** Adds a message to the log and sends it to everyone allowed to read it (and whoever sent it). */
  post(message: ChatMessage, sender?: C): void {
    this.messages.push(message);
    if (this.messages.length > CHAT_HISTORY) this.messages.shift();
    for (const other of this.seats()) {
      if (message.gmOnly && !isGm(other.player) && other !== sender) continue;
      this.send(other, { t: 'chat', message });
    }
  }

  /** The GM undid (or redid) the action these cards report. */
  undone(ids: string[], undone: boolean): void {
    for (const m of this.messages) if (ids.includes(m.id)) m.undone = undone || undefined;
    for (const c of this.seats()) this.send(c, { t: 'chatUndone', ids, undone });
  }
}

/** A chat card from the game itself, part of the action being recorded. */
export function gameCard(text: string, gmOnly = false): ChatMessage {
  return { id: randomUUID(), time: Date.now(), from: 'Combat', color: '#c8b48a', text, ...(gmOnly && { gmOnly }) };
}
