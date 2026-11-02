// Space held down turns a left drag on the map into a pan (MapView), the
// way image editors do; a tap of Space still ends your turn (GameScreen),
// on release, so a pan never ends it.

export class SpaceKey {
  private down = false;
  private moved = false;

  get held(): boolean {
    return this.down;
  }

  /** Space went down (again while held: the key repeats). */
  press(): void {
    if (this.down) return;
    this.down = true;
    this.moved = false;
  }

  /** The map was dragged while Space was held. */
  panned(): void {
    this.moved = true;
  }

  /** Space came up: whether it was a tap (held without panning). */
  release(): boolean {
    const tap = this.down && !this.moved;
    this.reset();
    return tap;
  }

  /** Forget the key (the window lost focus while it was down). */
  reset(): void {
    this.down = false;
    this.moved = false;
  }
}

/** The page's one Space key. */
export const spaceKey = new SpaceKey();
