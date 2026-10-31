import type { Session } from '../session.ts';

/** Offers to react out of turn: an enemy left one of your creatures' reach. */
export function ReactionPrompt({ session }: Readonly<{ session: Session }>) {
  const offer = session.reactions[0];
  if (!offer) return null;
  const name = (id: string) => session.tokens.get(id)?.name ?? 'Someone';
  return (
    <div className="aiming frame reaction-prompt" role="dialog" aria-label="Reaction">
      <span className="aiming-name">{`${name(offer.reactor)}: opportunity attack on ${name(offer.target)}?`}</span>
      <span className="slot-choices">
        {offer.attacks.map((attack) => (
          <button key={attack} className="chip" onClick={() => session.takeReaction(offer.id, attack)}>
            {attack}
          </button>
        ))}
        <button className="chip" onClick={() => session.takeReaction(offer.id)}>
          Let it go
        </button>
      </span>
    </div>
  );
}
