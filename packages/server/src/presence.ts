import { isGm, type Player, type Point } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';

// Where everyone is at the table, live: rulers (shared/ruler.ts), cursors and
// pings. None of it is a document: a client sends it as the pointer moves
// and the others on its scene are shown it straight away. Nothing is saved
// and nothing can be undone. A ruler or cursor goes when its player puts it
// away, leaves, or is moved to another scene.

interface PresenceSeat {
  player: Player;
  scene: string;
  /** Its ruler is out. */
  ruler?: boolean;
  /** Its cursor is on the map. */
  cursor?: boolean;
}

/** What a client sends about where it is. */
export type PresenceMessage =
  { t: 'ruler'; points: Point[] } | { t: 'cursor'; at: Point | null } | { t: 'ping'; at: Point; pull?: boolean };

export function isPresenceMessage(msg: { t: string }): msg is PresenceMessage {
  return msg.t === 'ruler' || msg.t === 'cursor' || msg.t === 'ping';
}

export class Presence<C extends PresenceSeat> {
  constructor(
    private clients: () => Iterable<C>,
    private send: (c: C, msg: ServerMessage) => void,
  ) {}

  handle(c: C, msg: PresenceMessage): void {
    if (msg.t === 'ruler') return this.lay(c, msg.points);
    if (msg.t === 'cursor') return this.point(c, msg.at);
    this.ping(c, msg.at, msg.pull);
  }

  /** `c` left `scene` (it went, or was sent elsewhere): its ruler and cursor there go. */
  left(c: C, scene: string): void {
    if (c.ruler) this.lay(c, [], scene);
    if (c.cursor) this.point(c, null, scene);
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

function who({ id, name, color }: Player) {
  return { player: id, name, color };
}
