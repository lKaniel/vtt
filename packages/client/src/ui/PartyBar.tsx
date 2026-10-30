import type { Session } from '../session.ts';

/** Portraits of your party. Click to select, double-click to jump to them. */
export function PartyBar({ session }: { session: Session }) {
  const you = session.you;
  // Players see their own tokens; the GM sees the whole party.
  const mine = [...session.tokens.values()].filter((t) =>
    you?.role === 'gm' ? t.controllers.length > 0 : !!you && t.controllers.includes(you.id),
  );
  if (mine.length === 0) return null;
  return (
    <nav className="party">
      {mine.map((t) => (
        <button
          key={t.id}
          className={`portrait${session.selected === t.id ? ' selected' : ''}`}
          style={{ background: t.color }}
          title={`${t.name}: click to select, double-click to find`}
          onClick={() => session.select(t.id)}
          onDoubleClick={() => session.focus([t.x, t.y])}
        >
          <span className="initials">{t.name.slice(0, 2)}</span>
          <span className="portrait-name">{t.name}</span>
        </button>
      ))}
    </nav>
  );
}
