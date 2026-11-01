import type { ReactionOffer } from '@vtt/system-dnd5e';
import type { Session } from '../session.ts';
import { Button } from './kit/button.tsx';

const CHOICE_LABELS: Record<string, string> = {
  shield: 'Shield (+5 AC)',
  'uncanny-dodge': 'Uncanny Dodge (half damage)',
};

/** What the offer asks, e.g. "Goblin: opportunity attack on Bo?". */
function question(offer: ReactionOffer, name: (id: string) => string): string {
  if (offer.kind === 'hit')
    return `${name(offer.target)} is about to hit ${name(offer.reactor)} (${offer.total}). React?`;
  return `${name(offer.reactor)}: opportunity attack on ${name(offer.target)}?`;
}

/** Offers to react out of turn: an enemy left your creature's reach, or an attack is about to hit it. */
export function ReactionPrompt({ session }: Readonly<{ session: Session }>) {
  const offer = session.reactions[0];
  if (!offer) return null;
  const name = (id: string) => session.tokens.get(id)?.name ?? 'Someone';
  return (
    <div className="aiming frame reaction-prompt" role="dialog" aria-label="Reaction">
      <span className="aiming-name">{question(offer, name)}</span>
      <span className="slot-choices">
        {offer.choices.map((choice) => (
          <Button key={choice} variant="outline" size="sm" onClick={() => session.takeReaction(offer.id, choice)}>
            {CHOICE_LABELS[choice] ?? choice}
          </Button>
        ))}
        <Button variant="outline" size="sm" onClick={() => session.takeReaction(offer.id)}>
          {offer.kind === 'hit' ? 'Take the hit' : 'Let it go'}
        </Button>
      </span>
    </div>
  );
}
