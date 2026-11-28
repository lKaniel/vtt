// The phone layout: on a phone the table is one thing at a time (the map,
// your sheet or the log), picked from a bar of tabs along the bottom, with
// the action bar over the map. The screen decides, unless the player picked
// a layout in settings.

/** The layout a player picked: follow the screen, or always or never the phone one. */
export type PhoneLayout = 'auto' | 'on' | 'off';
export const PHONE_LAYOUTS: readonly PhoneLayout[] = ['auto', 'on', 'off'];

/** The screen's size in CSS pixels, and whether a finger is the pointer. */
export interface ScreenShape {
  width: number;
  height: number;
  coarse: boolean;
}

/** Wider than this is a tablet or more, which keeps the table layout. */
const PHONE_WIDTH = 640;
/** A touch screen no taller than this is a phone held sideways. */
const PHONE_HEIGHT = 480;

export function isPhoneScreen(screen: ScreenShape): boolean {
  return screen.width <= PHONE_WIDTH || (screen.coarse && screen.height <= PHONE_HEIGHT);
}

export function usesPhoneLayout(layout: PhoneLayout, screen: ScreenShape): boolean {
  if (layout === 'auto') return isPhoneScreen(screen);
  return layout === 'on';
}

/** The phone's tabs: the map (with the action bar), the sheet in front, the side panel. */
export type PhoneTab = 'map' | 'sheet' | 'log';

/** Which tab is showing: the log covers everything, an open sheet covers the map. */
export function phoneTab(open: { log: boolean; sheet: boolean }): PhoneTab {
  if (open.log) return 'log';
  return open.sheet ? 'sheet' : 'map';
}
