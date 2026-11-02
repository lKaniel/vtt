import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { popoutFeatures } from '../popouts.ts';
import { PortalHost } from './kit/portal-host.tsx';

/** The page's stylesheets and fonts, copied so the window looks like the table. */
function copyStyles(from: Document, to: Document): void {
  for (const node of from.head.querySelectorAll('link[rel="stylesheet"], style')) {
    to.head.append(to.importNode(node, true));
  }
  to.documentElement.className = from.documentElement.className;
  to.body.className = `${from.body.className} popout`;
}

/**
 * Draws its children in a window of their own (a popped-out sheet), still
 * part of this page: the same session, live. They are drawn into a box that
 * moves into the window once it opens. Closing the window calls `onClose`;
 * unmounting closes the window. A blocked popup closes at once.
 */
export function PopOutWindow({
  title,
  onClose,
  children,
}: Readonly<{ title: string; onClose: () => void; children: ReactNode }>) {
  const [box] = useState(() => document.createElement('div'));
  const win = useRef<Window>(null);
  const closed = useRef(onClose);
  useEffect(() => {
    closed.current = onClose;
  });
  useEffect(() => {
    const opened = window.open('', '', popoutFeatures());
    if (!opened) {
      closed.current();
      return;
    }
    win.current = opened;
    copyStyles(document, opened.document);
    opened.document.body.append(opened.document.adoptNode(box));
    const gone = () => closed.current();
    opened.addEventListener('pagehide', gone);
    return () => {
      opened.removeEventListener('pagehide', gone);
      opened.close();
    };
  }, [box]);
  useEffect(() => {
    if (win.current) win.current.document.title = title;
  }, [title]);
  return createPortal(<PortalHost value={box}>{children}</PortalHost>, box);
}
