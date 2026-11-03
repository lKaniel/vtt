import { readPref, writePref } from '../prefs.ts';

// Whether this browser shows the map in 3D (view3d/View3D.ts), as
// `session.view3d`: a player's own choice, kept in this browser.

const PREF = 'view3d';

export class View3DSwitch {
  /** The map shows in 3D. */
  on: boolean;

  /** `ui.changed`: the screen and the map (view3d/view3d-switch.ts) follow the switch. */
  constructor(
    private readonly ui: { changed(): void },
    stored: 'on' | 'off' = readPref(PREF, ['on', 'off'] as const, 'off'),
  ) {
    this.on = stored === 'on';
  }

  set(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    writePref(PREF, on ? 'on' : 'off');
    this.ui.changed();
  }

  toggle(): void {
    this.set(!this.on);
  }
}
