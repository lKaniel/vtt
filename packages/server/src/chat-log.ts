import { randomUUID } from 'node:crypto';
import { chatFor, type Player, type RollMode, withMode } from '@vtt/shared';
import { type ChatMessage, disguiseText, type ServerMessage, type Token } from '@vtt/system-dnd5e';
import { chatMessage } from './actions/chat-command.ts';

// The game's chat: the last 200 messages, sent to everyone allowed to read
// each one, and cards the game itself posts (initiative, attacks, time).

const CHAT_HISTORY = 200;

type Wearer = Pick<Token, 'name' | 'looks' | 'look'>;

/** Every string in `value` with disguised creatures named as they go by (disguise.ts). */
function disguiseAll(value: unknown, tokens: readonly Wearer[]): unknown {
  if (typeof value === 'string') return disguiseText(value, tokens);
  if (Array.isArray(value)) return value.map((v) => disguiseAll(v, tokens));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, disguiseAll(v, tokens)]));
}

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
    /** The creatures that may be in disguise: the chat calls them by the name they go by. */
    private wearers: () => Iterable<Wearer> = () => [],
  ) {}

  /** `message` with disguised creatures named as everyone at the table knows them. */
  private disguise(message: ChatMessage): ChatMessage {
    const worn = [...this.wearers()].filter((t) => t.look);
    return worn.length ? (disguiseAll(message, worn) as ChatMessage) : message;
  }

  get all(): readonly ChatMessage[] {
    return this.messages;
  }

  /** What a player typed; a message (thrown) when it can't be read. */
  say(seat: C, text: string): void {
    if (text) this.post(chatMessage(seat.player, text, seat.rollMode));
  }

  /** Adds a message to the log and sends each seat what it may read of it (see roll-modes.ts). */
  post(sent: ChatMessage): void {
    const message = this.disguise(sent);
    this.messages.push(message);
    if (this.messages.length > CHAT_HISTORY) this.messages.shift();
    this.broadcast(message);
  }

  /** A card changed (a check request filling in): everyone allowed to read it gets it again. */
  update(sent: ChatMessage): void {
    const message = this.disguise(sent);
    const at = this.messages.findIndex((m) => m.id === message.id);
    if (at < 0) return this.post(sent);
    this.messages[at] = message;
    this.broadcast(message);
  }

  private broadcast(message: ChatMessage): void {
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
