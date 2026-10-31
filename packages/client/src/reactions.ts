import type { ReactionOffer, ServerMessage } from '@vtt/shared';

type ReactionMessage = Extract<ServerMessage, { t: 'reactionOffer' | 'reactionGone' }>;

/** The reaction offers open to this player after one from the server. */
export function withOffer(offers: readonly ReactionOffer[], msg: ReactionMessage): ReactionOffer[] {
  if (msg.t === 'reactionGone') return offers.filter((o) => o.id !== msg.id);
  if (offers.some((o) => o.id === msg.offer.id)) return [...offers];
  return [...offers, msg.offer];
}
