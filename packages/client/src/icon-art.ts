import type { Attack, FeatureSheet, Item, Spell, TokenView } from '@vtt/shared';
import manifest from './icon-art.json';

// Painted icons in public/art/icons, listed in icon-art.json. Anything
// without a painting falls back to the drawn glyphs in icons.ts.

type Kind = keyof typeof manifest;

const painted = Object.fromEntries(
  Object.entries(manifest).map(([kind, ids]) => [kind, new Set<string>(ids)]),
) as Record<Kind, Set<string>>;

function art(kind: Kind, id: string): string | undefined {
  return painted[kind].has(id) ? `/art/icons/${kind}/${id}.webp` : undefined;
}

export const spellArt = (spell: Spell) => art('spells', spell.id);
export const featureArt = (feature: FeatureSheet) => art('features', feature.id);
export const attackArt = (attack: Attack) =>
  art('actions', attack.kind === 'ranged' ? 'ranged-attack' : 'melee-attack');
export const itemArt = (item: Item | undefined) => (item ? art('items', item.id) : undefined);

/** The painted ring a token stands on: gold when selected, blue for the party, red for the rest. */
export function tokenBaseArt(token: TokenView, selected: boolean): string {
  if (selected) return '/art/ui/token-base-selected.webp';
  return token.controllers.length > 0 ? '/art/ui/token-base-ally.webp' : '/art/ui/token-base-foe.webp';
}

/** A painted die for the quick-roll buttons; there is no d100, so it borrows the d10. */
export const diceArt = (die: string) => `/art/icons/dice/${die === 'd100' ? 'd10' : die}.webp`;

/** A token's own picture, or a hooded stranger for creatures without one. */
export const portraitOf = (token: TokenView) => token.img ?? '/art/ui/portrait-default.svg';
