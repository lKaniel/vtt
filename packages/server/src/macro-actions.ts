import { canControl, canObserve, macroLines, type Macro, type Player, type RollMode } from '@vtt/shared';
import type { ChatMessage } from '@vtt/system-dnd5e';
import { chatMessage } from './chat-command.ts';
import { fromDoc } from './doc-sync.ts';
import type { GameStore } from './game-store.ts';
import { Refusal } from './table.ts';

// Running a chat macro: each line of its command goes to chat as if the
// seat had typed it (rolls in the seat's roll mode), spoken by the token it
// was run for when the seat controls that token.

export interface Seat {
  player: Player;
  rollMode?: RollMode;
}

export interface RunMacro {
  t: 'runMacro';
  macro: string;
  token?: string;
}

function macroFor(store: GameStore, player: Player, id: string): Macro {
  const doc = store.docs.get('macros', id);
  const owned = doc && store.access.owned('macros', doc);
  if (!doc || !owned || !canObserve(owned, player)) throw new Refusal('No such macro');
  return fromDoc<Macro>(doc);
}

/** Who the lines are said by: the token's name, when the seat controls it. */
function speaker(store: GameStore, player: Player, token: string | undefined): string | undefined {
  const t = token ? store.tokens.get(token) : undefined;
  return t && canControl(t, player) ? t.name : undefined;
}

/** The chat messages a macro posts, all made before any is posted so a bad line posts none. */
export function macroMessages(store: GameStore, seat: Seat, msg: RunMacro): ChatMessage[] {
  const macro = macroFor(store, seat.player, msg.macro);
  const from = speaker(store, seat.player, msg.token);
  return macroLines(macro.command).map((line) => {
    try {
      const said = chatMessage(seat.player, line, seat.rollMode);
      return from ? { ...said, from } : said;
    } catch (e) {
      throw new Refusal(`${macro.name}: ${(e as Error).message}`);
    }
  });
}
