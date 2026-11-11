import type { ClientMessage, ServerMessage } from '@vtt/system-dnd5e';
import type { SessionPart } from './session-part.ts';

// A tile's question, as `session.asks`: a trigger (Monk's dialog buttons)
// asks the player who set it off to pick, and their answer runs what that
// button does (server: trigger-asks.ts).

export type TileQuestion = Omit<Extract<ServerMessage, { t: 'triggerChoice' }>, 't'>;

export class TileAsks implements SessionPart {
  /** The question waiting for your answer. */
  question?: TileQuestion;

  constructor(private readonly s: { send(msg: ClientMessage): void }) {}

  receive(msg: ServerMessage): boolean | undefined {
    if (msg.t !== 'triggerChoice') return undefined;
    const { t: _t, ...question } = msg;
    this.question = question;
    return true;
  }

  /** Answers with the option at `index`. */
  answer(index: number): void {
    if (!this.question) return;
    this.s.send({ t: 'triggerChoice', id: this.question.id, option: index });
    this.question = undefined;
  }

  /** Closes the question unanswered: nothing it offered happens. */
  dismiss(): void {
    this.question = undefined;
  }
}
