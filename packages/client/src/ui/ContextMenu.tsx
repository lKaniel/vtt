import { useEffect, useRef } from 'react';
import type { Session } from '../session.ts';

/** The right-click menu the map opened, at the pointer. A click elsewhere closes it. */
export function ContextMenu({ session }: Readonly<{ session: Session }>) {
  const menu = session.menu;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) session.closeMenu();
    };
    addEventListener('pointerdown', away, true);
    return () => removeEventListener('pointerdown', away, true);
  }, [menu, session]);
  if (!menu) return null;
  // Keep the menu on screen near the right and bottom edges.
  const left = Math.min(menu.screen[0], innerWidth - 220);
  const top = Math.min(menu.screen[1], innerHeight - 32 * menu.items.length - 16);
  return (
    <div ref={box} className="context-menu frame" style={{ left, top }} role="menu">
      {menu.items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          className={item.danger ? 'danger' : undefined}
          onClick={() => {
            session.closeMenu();
            item.run();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
