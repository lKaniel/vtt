import type { Tip } from '../tooltip.ts';

/** The hover card above an action tile. Shown by CSS while its parent is hovered or focused. */
export function TipCard({ tip }: Readonly<{ tip: Tip }>) {
  return (
    <div className="tip" role="tooltip">
      <div className="tip-title">{tip.title}</div>
      <div className="tip-subtitle">{tip.subtitle}</div>
      {tip.facts.length > 0 && (
        <ul className="tip-facts">
          {tip.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {tip.body && <p className="tip-body">{tip.body}</p>}
      {tip.warning && <p className="tip-warning">{tip.warning}</p>}
    </div>
  );
}
