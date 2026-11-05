import type { Point } from '@vtt/shared';
import { groundDue, groundToDraw, type Square } from './frame-budget.ts';
import type { PixiBridge } from './pixi-bridge.ts';
import type { Ground } from './scene3d.ts';
import { drapeOver } from './terrain-paint.ts';

// The ground picture the 2D map draws for the 3D view (pixi-bridge.ts), and
// when the 3D view draws at all. The 2D map draws a square a little bigger
// than the camera sees, again only when the camera leaves it or something on
// the map may have changed (a poke: the pointer, a creature walking), and a
// few times a second for what flickers. The 3D view draws when something
// changed (the camera, the ground, a creature, a model), and only `idleFps`
// times a second while nothing does.

export class GroundFeed {
  /** The square the 2D map drew last, which the ground shows now, and the one it was asked for since. */
  private drawn?: Square;
  private asked?: Square;
  private sinceDrawn = 0;
  /** Something on the 2D map may have changed: draw it again soon. */
  private poked = true;
  private walkersSeen = '';
  /** Something changed since the 3D view last drew. */
  private changed = true;
  private sinceRender = 0;
  private lastView = '';

  /** `refresh`: how often a still ground is drawn again, a second; `idleFps`: how often a still view is. */
  constructor(
    private readonly bridge: PixiBridge,
    private readonly ground: Ground,
    private readonly rates: { refresh: number; idleFps: number },
  ) {}

  /** The pointer moved or something on the map changed: the ground and the view are drawn again. */
  poke(): void {
    this.poked = this.changed = true;
  }

  /** Something in the 3D view changed (its size, the walls): it is drawn again. */
  touch(): void {
    this.changed = true;
  }

  /** The 2D map has drawn the square asked for last: lays that picture down at height `floor`. */
  lay(dt: number, floor: number): void {
    this.sinceDrawn += dt;
    const fresh = this.bridge.takeDrawn();
    if (fresh && this.asked) {
      this.drawn = this.asked;
      this.sinceDrawn = 0;
      this.changed = true;
    }
    if (!this.drawn) return;
    this.ground.show(this.drawn.center, this.drawn.half, floor, fresh);
    drapeOver(this.ground.picture, this.drawn.center, this.drawn.half);
  }

  /** Asks for a new square when `need` leaves the one drawn, else again only when poked or due. */
  ask(need: Square): void {
    const next = groundToDraw(need, this.asked);
    if (next) {
      this.bridge.frame(next.center, next.half);
      this.asked = next;
    } else if (groundDue({ sinceDrawn: this.sinceDrawn, poked: this.poked }, this.rates.refresh)) this.bridge.redraw();
    this.poked = false;
  }

  /** Creatures walking move their rings on the 2D map: the ground is drawn again while they do. */
  walkers(spots: readonly Point[]): void {
    const seen = spots.map((p) => `${p[0]},${p[1]}`).join(';');
    if (seen !== this.walkersSeen) this.poke();
    this.walkersSeen = seen;
  }

  /** Whether the 3D view draws this frame: `view` names what it shows (camera, models, hover). */
  due(view: string, dt: number): boolean {
    this.sinceRender += dt;
    const still = !this.changed && view === this.lastView;
    if (still && this.sinceRender < 1 / this.rates.idleFps) return false;
    this.changed = false;
    this.lastView = view;
    this.sinceRender = 0;
    return true;
  }
}
