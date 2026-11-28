import type { Tip } from '../text/tooltip.ts';

/** The hover card above an action tile. Shown by CSS while its parent is hovered or focused. */
export function TipCard({ tip }: Readonly<{ tip: Tip }>) {
  return (
    // A tap leaves the tile focused: on a phone the card would stay over the map, so the sheet tells it instead.
    <div className="tip phone:hidden" role="tooltip">
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
      {tip.note && <p className="tip-body">{tip.note}</p>}
      {tip.warning && <p className="tip-warning">{tip.warning}</p>}
    </div>
  );
}
