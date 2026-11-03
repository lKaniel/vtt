import type {
  Attack,
  Condition,
  EffectTemplate,
  FeatureSheet,
  Item,
  Monster,
  Spell,
  TokenView,
} from '@vtt/system-dnd5e';
import { assetUrl } from './assets.ts';
import { isWildcard } from '@vtt/core';
import manifest from './icon-art.json';
import { packPicture } from './content/pack-art.ts';

// The picture on each icon: the game's packs' art first (content/pack-art.ts,
// so a pack turned on shows on sheets, the hotbar, the Compendium and
// effects alike), then the painted icons in public/art/icons, listed in
// icon-art.json. Anything without either falls back to the drawn glyphs in
// icons.ts.

type Kind = keyof typeof manifest;

const painted = Object.fromEntries(
  Object.entries(manifest).map(([kind, ids]) => [kind, new Set<string>(ids)]),
) as Record<Kind, Set<string>>;

function art(kind: Kind, id: string): string | undefined {
  return painted[kind].has(id) ? `/art/icons/${kind}/${id}.webp` : undefined;
}

export const spellArt = (spell: Pick<Spell, 'id' | 'name'>) =>
  packPicture('spell', spell.id, spell.name) ?? art('spells', spell.id);
/** Features painted with another icon: the basic action they are, or the closest painting. */
const BORROWED: Record<string, [Kind, string]> = {
  'patient-defense': ['actions', 'dodge'],
  'step-of-the-wind': ['actions', 'dash'],
  'flurry-of-blows': ['actions', 'melee-attack'],
  'martial-arts': ['actions', 'melee-attack'],
  'turn-undead': ['features', 'channel-divinity'],
  'paladins-smite': ['features', 'divine-smite'],
};

/** A class feature's picture; Dash, Dodge and Disengage (and cunning-dash and the like) use the action icons. */
export function featureArt(feature: Pick<FeatureSheet, 'id'> & { name?: string }): string | undefined {
  const own =
    packPicture('feature', feature.id, feature.name) ?? art('features', feature.id) ?? art('actions', feature.id);
  if (own) return own;
  const borrowed = BORROWED[feature.id];
  if (borrowed) return art(...borrowed);
  const basic = /-(dash|dodge|disengage)$/.exec(feature.id);
  return basic ? art('actions', basic[1]!) : undefined;
}
/** A weapon attack shows its weapon's picture from the packs, else the painted melee or ranged attack. */
export const attackArt = (attack: Pick<Attack, 'name' | 'kind'>) =>
  packPicture('item', undefined, attack.name) ??
  art('actions', attack.kind === 'ranged' ? 'ranged-attack' : 'melee-attack');
export const itemArt = (item: Pick<Item, 'id' | 'name'> | undefined) =>
  item ? (packPicture('item', item.id, item.name) ?? art('items', item.id)) : undefined;

/** A condition's picture from the packs. */
const conditionArt = (condition: Condition) => packPicture('condition', condition);

/** An effect's picture: its first condition's, else that of the spell, feature or condition it is named for. */
export function effectArt(effect: Pick<EffectTemplate, 'conditions' | 'name'>): string | undefined {
  const condition = effect.conditions?.[0];
  if (condition) return conditionArt(condition);
  const name = effect.name;
  if (!name) return undefined;
  return (
    packPicture('spell', undefined, name) ??
    packPicture('feature', undefined, name) ??
    packPicture('condition', undefined, name)
  );
}

/** A monster's token from the packs, else its own painted one. */
export const monsterArt = (monster: Pick<Monster, 'id' | 'img'>) =>
  packPicture('monster', monster.id) ?? (monster.img && assetUrl(monster.img));

/** A painted die for the quick-roll buttons; there is no d100, so it borrows the d10. */
export const diceArt = (die: string) => `/art/icons/dice/${die === 'd100' ? 'd10' : die}.webp`;

/** A token's own picture, else its monster's painted token, if it has either. A wildcard pattern no token picked from yet isn't a picture. */
export const cutoutOf = (token: TokenView): string | undefined =>
  token.img && !isWildcard(token.img) ? assetUrl(token.img) : token.art && assetUrl(token.art);

/** The picture to show for a token, or a hooded stranger for creatures without one. */
export const portraitOf = (token: TokenView) => cutoutOf(token) ?? '/art/ui/portrait-default.webp';
