import { isGm, type Player, type Point, type RollMode } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';

// Where everyone is at the table, live: rulers (shared/ruler.ts), cursors and
// pings, and the tokens each player targets. None of it is a document: a client sends it as the pointer moves
// and the others on its scene are shown it straight away. Nothing is saved
// and nothing can be undone. A ruler or cursor goes when its player puts it
// away, leaves, or is moved to another scene. Targets are only shown to
// those who can see the token. Each seat's roll mode (who sees its rolls)
// is kept here too.

interface PresenceSeat {
  player: Player;
  scene: string;
  /** Its ruler is out. */
  ruler?: boolean;
  /** Its cursor is on the map. */
  cursor?: boolean;
  /** The tokens it targets. */
  targets?: string[];
  /** The tokens it can see. */
  visible: Set<string>;
  /** Who sees its rolls (see roll-modes.ts); none: everyone. */
  rollMode?: RollMode;
}

/** What a client sends about where it is. */
export type PresenceMessage =
  | { t: 'ruler'; points: Point[] }
  | { t: 'cursor'; at: Point | null }
  | { t: 'ping'; at: Point; pull?: boolean }
  | { t: 'target'; tokens: string[] }
  | { t: 'rollMode'; mode: RollMode };

const KINDS = new Set(['ruler', 'cursor', 'ping', 'target', 'rollMode']);

export function isPresenceMessage(msg: { t: string }): msg is PresenceMessage {
  return KINDS.has(msg.t);
}

export class Presence<C extends PresenceSeat> {
  constructor(
    private clients: () => Iterable<C>,
    private send: (c: C, msg: ServerMessage) => void,
  ) {}

  handle(c: C, msg: PresenceMessage): void {
    if (msg.t === 'ruler') return this.lay(c, msg.points);
    if (msg.t === 'cursor') return this.point(c, msg.at);
    if (msg.t === 'target') return this.target(c, msg.tokens);
    if (msg.t === 'rollMode') {
      c.rollMode = msg.mode;
      return;
    }
    this.ping(c, msg.at, msg.pull);
  }

  /** `c` left `scene` (it went, or was sent elsewhere): its ruler and cursor there go. */
  left(c: C, scene: string): void {
    if (c.ruler) this.lay(c, [], scene);
    if (c.cursor) this.point(c, null, scene);
    if (c.targets?.length) this.target(c, [], scene);
  }

  /** `c` arrived on its scene: it is shown what the others there target. */
  greet(c: C): void {
    for (const other of this.clients()) {
      if (other !== c && other.scene === c.scene && other.targets?.length) this.send(c, targetsFor(other, c));
    }
  }

  /** `c` targets `tokens` (none: it stops), of those it can see. */
  private target(c: C, tokens: string[], scene = c.scene): void {
    c.targets = [...new Set(tokens)].filter((id) => c.visible.has(id));
    for (const other of this.clients())
      if (other !== c && other.scene === scene) this.send(other, targetsFor(c, other));
  }

  /** `c` laid its ruler through `points` (none: put it away). */
  private lay(c: C, points: Point[], scene = c.scene): void {
    c.ruler = points.length > 0;
    this.tell(c, scene, { t: 'ruler', ...who(c.player), points });
  }

  /** `c`'s pointer is at `at` on the map (null: it left the map). */
  private point(c: C, at: Point | null, scene = c.scene): void {
    c.cursor = at !== null;
    this.tell(c, scene, { t: 'cursor', ...who(c.player), at });
  }

  /** `c` pings a spot; the GM may pull everyone's view there. */
  private ping(c: C, at: Point, pull?: boolean): void {
    if (pull && !isGm(c.player)) return this.send(c, { t: 'error', message: 'Only the GM can pull everyone’s view.' });
    this.tell(c, c.scene, { t: 'ping', ...who(c.player), at, ...(pull ? { pull: true } : {}) });
  }

  /** Shows everyone else on `scene` what `c` did. */
  private tell(c: C, scene: string, msg: ServerMessage): void {
    for (const other of this.clients()) if (other !== c && other.scene === scene) this.send(other, msg);
  }
}

/** What `to` is told of `c`'s targets: the ones it can see. */
function targetsFor(c: PresenceSeat, to: PresenceSeat): ServerMessage {
  return { t: 'targets', ...who(c.player), tokens: (c.targets ?? []).filter((id) => to.visible.has(id)) };
}

function who({ id, name, color }: Player) {
  return { player: id, name, color };
}
