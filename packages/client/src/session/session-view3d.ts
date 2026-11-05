// Whether the map shows in 3D (view3d/View3D.ts), as `session.view3d`: the
// scene decides. A 3D scene (scene.json `view: "3d"`) shows in 3D, a 2D
// scene flat. The GM alone may lay a 3D scene flat for a while, to edit it
// on the 2D map; that lasts until they stand it up again.

/** What the switch reads of the table. */
interface Table {
  readonly world?: { readonly view?: '2d' | '3d' };
  isGm(): boolean;
}

/** How high (feet) a creature's walk to a map point ends, by what it climbs onto; none: where it is. */
export type Climb = (token: string, to: readonly [number, number]) => number | undefined;

export class View3DSwitch {
  /** The GM laid this 3D scene flat. */
  private flat = false;
  /** Set by the 3D view while it shows: how high a walk ends (view3d/climb3d.ts). */
  climb?: Climb;

  /** `ui.changed`: the screen and the map (view3d/view3d-switch.ts) follow the switch. */
  constructor(
    private readonly ui: { changed(): void },
    private readonly table: Table,
  ) {}

  /** The scene is a 3D scene. */
  get scene3d(): boolean {
    return this.table.world?.view === '3d';
  }

  /** The map shows in 3D. */
  get on(): boolean {
    return this.scene3d && !this.flat;
  }

  /** You may lay this scene flat and stand it up again: the GM, on a 3D scene. */
  get canFlip(): boolean {
    return this.scene3d && this.table.isGm();
  }

  /** The GM lays the 3D scene flat or stands it up again; nobody else can. */
  toggle(): void {
    if (!this.canFlip) return;
    this.flat = !this.flat;
    this.ui.changed();
  }
}
