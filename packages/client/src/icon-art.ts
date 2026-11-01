import type { Attack, FeatureSheet, Item, Spell, TokenView } from '@vtt/shared';
import { assetUrl } from './assets.ts';
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
/** Features painted with another icon: the basic action they are, or the closest painting. */
const BORROWED: Record<string, [Kind, string]> = {
  'patient-defense': ['actions', 'dodge'],
  'step-of-the-wind': ['actions', 'dash'],
  'flurry-of-blows': ['actions', 'melee-attack'],
  'martial-arts': ['actions', 'melee-attack'],
  'turn-undead': ['features', 'channel-divinity'],
  'paladins-smite': ['features', 'divine-smite'],
};

/** A class feature's painting; Dash, Dodge and Disengage (and cunning-dash and the like) use the action icons. */
export function featureArt(feature: FeatureSheet): string | undefined {
  const own = art('features', feature.id) ?? art('actions', feature.id);
  if (own) return own;
  const borrowed = BORROWED[feature.id];
  if (borrowed) return art(...borrowed);
  const basic = /-(dash|dodge|disengage)$/.exec(feature.id);
  return basic ? art('actions', basic[1]!) : undefined;
}
export const attackArt = (attack: Attack) =>
  art('actions', attack.kind === 'ranged' ? 'ranged-attack' : 'melee-attack');
export const itemArt = (item: Item | undefined) => (item ? art('items', item.id) : undefined);

/** A painted die for the quick-roll buttons; there is no d100, so it borrows the d10. */
export const diceArt = (die: string) => `/art/icons/dice/${die === 'd100' ? 'd10' : die}.webp`;

/** A token's own picture, else its monster's painted token, if it has either. */
export const cutoutOf = (token: TokenView): string | undefined => (token.img ? assetUrl(token.img) : token.art);

/** The picture to show for a token, or a hooded stranger for creatures without one. */
export const portraitOf = (token: TokenView) => cutoutOf(token) ?? '/art/ui/portrait-default.webp';
