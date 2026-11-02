import { createContext, useContext } from 'react';

// Where the kit's popovers, menus and dialogs open: the page's body, or the
// body of a popped-out window (ui/PopOutWindow.tsx) for what is drawn there.

const PortalHostContext = createContext<HTMLElement | undefined>(undefined);

export const PortalHost = PortalHostContext.Provider;

/** The element portals go into here; undefined is the page's own body. */
export function usePortalHost(): HTMLElement | undefined {
  return useContext(PortalHostContext);
}
