// The GM's "ignore walls" mode, as `session.throughWalls`: while it is on,
// the creatures the GM moves go straight where they are dropped, through
// walls and other creatures (to free one stuck in a wall). The server
// refuses it to everyone else (play/token-moves.ts), so players never see
// the switch.

/** What the switch reads of the table. */
interface Table {
  isGm(): boolean;
}

export class ThroughWalls {
  private wanted = false;

  constructor(
    private readonly ui: { changed(): void },
    private readonly table: Table,
  ) {}

  /** The GM's moves go through walls now. */
  get on(): boolean {
    return this.wanted && this.table.isGm();
  }

  /** The GM turns it on or off; nobody else can. */
  toggle(): void {
    if (!this.table.isGm()) return;
    this.wanted = !this.wanted;
    this.ui.changed();
  }
}
