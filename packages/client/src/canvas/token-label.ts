import { hasCondition, type TokenView } from '@vtt/system-dnd5e';
import { mapName } from '../play/looks.ts';

// The words under a token on the map.

/**
 * The name under a token, with notes for the GM, and whether it is drawn
 * faintly: hidden tokens, and invisible ones seen anyway (by their own side,
 * the GM, or truesight).
 */
export function tokenLabel(token: TokenView): { label: string; faint: boolean } {
  const invisible = hasCondition(token, 'invisible');
  const { name, really } = mapName(token);
  const notes = [really, token.hidden && 'hidden', invisible && 'invisible', token.visibleTo && 'illusion'].filter(
    Boolean,
  );
  return {
    label: notes.length ? `${name} (${notes.join(', ')})` : name,
    faint: token.hidden || invisible,
  };
}
