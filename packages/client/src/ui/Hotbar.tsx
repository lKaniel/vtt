import type { Session } from '../session.ts';

/** Bottom bar for the selected token. Actions arrive with combat in phase 3. */
export function Hotbar({ session }: Readonly<{ session: Session }>) {
  const token = session.selected ? session.tokens.get(session.selected) : undefined;
  return (
    <footer className="hotbar">
      {token ? (
        <>
          <div className="hotbar-who">
            <span className="dot" style={{ background: token.color }} />
            <strong>{token.name}</strong>
            <span className="muted">speed {token.speed} ft</span>
          </div>
          <div className="hotbar-slots">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="slot" />
            ))}
          </div>
        </>
      ) : null}
      <div className="hint">
        {token ? 'Click the ground to walk · Esc to deselect' : 'Click one of your tokens to select it'} · Drag to pan ·
        Wheel to zoom
      </div>
    </footer>
  );
}
