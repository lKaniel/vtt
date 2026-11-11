import type { Point } from '@vtt/shared';
import type { ChatMessage, ServerMessage, TokenView } from '@vtt/system-dnd5e';

// Small helpers for the session's own messages (session.ts).

/** How many chat messages the log keeps. */
const CHAT_HISTORY = 200;

/** Someone else's ruler, cursor, ping or targets. */
export type TableNews = Extract<ServerMessage, { t: 'ruler' | 'cursor' | 'ping' | 'targets' }>;
const PRESENCE = new Set(['ruler', 'cursor', 'ping', 'targets']);
export const isTableNews = (msg: ServerMessage): msg is TableNews => PRESENCE.has(msg.t);

/** The chat log with `message` added, or put in place of its earlier version. */
export function withChat(chat: readonly ChatMessage[], message: ChatMessage): ChatMessage[] {
  return chat.some((m) => m.id === message.id)
    ? chat.map((m) => (m.id === message.id ? message : m))
    : [...chat, message].slice(-CHAT_HISTORY);
}

/** A token after it walked to `end`, at `elevation` when the move set one. */
export function movedTo(t: TokenView, end: Point, elevation: number | undefined): TokenView {
  const { elevation: _, ...rest } = t;
  return { ...rest, x: end[0], y: end[1], ...(elevation !== undefined && { elevation }) };
}
