import type { ServerMessage } from '@vtt/system-dnd5e';

// The parts the session holds (session.ts): each takes the messages, the
// welcome and the departures it cares about.

export type Welcome = Extract<ServerMessage, { t: 'welcome' }>;

/** A part of the session: an area such as the journal or the fog, reached as `session.<part>`. */
export interface SessionPart {
  /** A server message: whether the screen changed, or undefined when it is another part's. */
  receive?(msg: ServerMessage): boolean | undefined;
  /** The table starts (or starts over) from the welcome. */
  welcome?(msg: Welcome): void;
  /** A token left the map. */
  gone?(id: string): void;
}
