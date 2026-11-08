import type { ReactionOffer } from '@vtt/system-dnd5e';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { t } from '../i18n/index.ts';

const CHOICE_LABELS: Record<string, string> = {
  shield: 'Shield (+5 AC)',
  'uncanny-dodge': 'Uncanny Dodge (half damage)',
  counterspell: 'Counterspell',
};

/** A focus art (weapon parry, dodge step) by its feature's name on the reactor's sheet. */
function artLabel(session: Session, reactor: string, choice: string): string {
  const name = session.tokens.get(reactor)?.sheet?.features.find((f) => f.id === choice)?.name;
  return name ? t('reaction.art', { name }) : choice;
}

/** What the offer asks, e.g. "Goblin: opportunity attack on Bo?". */
function question(offer: ReactionOffer, name: (id: string) => string): string {
  if (offer.kind === 'spell')
    return `${name(offer.target)} is casting ${offer.spell ?? 'a spell'}. Counter it with ${name(offer.reactor)}?`;
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
          <Button
            key={choice}
            variant="outline"
            size="sm"
            onClick={() => session.requests.takeReaction(offer.id, choice)}
          >
            {CHOICE_LABELS[choice] ?? artLabel(session, offer.reactor, choice)}
          </Button>
        ))}
        <Button variant="outline" size="sm" onClick={() => session.requests.takeReaction(offer.id)}>
          {offer.kind === 'hit' ? 'Take the hit' : 'Let it go'}
        </Button>
      </span>
    </div>
  );
}
