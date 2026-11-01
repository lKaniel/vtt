import type { Player, Point } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';

// Rulers (shared/ruler.ts) are not documents: a client lays one through its
// waypoints as the pointer moves, and the others on its scene are shown it
// straight away. Nothing is saved and nothing can be undone. A ruler goes
// when its player puts it away, leaves, or is moved to another scene.

interface RulerSeat {
  player: Player;
  scene: string;
  /** Its ruler is out. */
  ruler?: boolean;
}

export class Rulers<C extends RulerSeat> {
  constructor(
    private clients: () => Iterable<C>,
    private send: (c: C, msg: ServerMessage) => void,
  ) {}

  /** `c` laid its ruler through `points` (none: put it away); everyone else on `scene` sees it. */
  lay(c: C, points: Point[], scene = c.scene): void {
    c.ruler = points.length > 0;
    const { id, name, color } = c.player;
    const msg: ServerMessage = { t: 'ruler', player: id, name, color, points };
    for (const other of this.clients()) if (other !== c && other.scene === scene) this.send(other, msg);
  }

  /** `c` left `scene` (it went, or was sent elsewhere): its ruler there goes. */
  left(c: C, scene: string): void {
    if (c.ruler) this.lay(c, [], scene);
  }
}
