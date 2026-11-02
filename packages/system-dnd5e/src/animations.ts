import { z } from 'zod';

// The animation library's names (the client draws them, see the client's
// animations.ts): a creature may pick one per attack or spell, kept on its
// sheet as `animations` ("attack:<name>" or "spell:<id>" → id), like
// Automated Animations' per-item choice.

export const ANIMATIONS = {
  blade: 'Steel blade',
  'flame-blade': 'Flaming blade',
  'frost-blade': 'Frost blade',
  'storm-blade': 'Storm blade',
  'acid-blade': 'Acid blade',
  'radiant-blade': 'Radiant blade',
  'shadow-blade': 'Shadow blade',
  arrow: 'Arrow',
  'fire-arrow': 'Fire arrow',
  'frost-arrow': 'Frost arrow',
  'poison-arrow': 'Poison arrow',
  'fire-orb': 'Fire orb',
  'frost-orb': 'Frost orb',
  'acid-orb': 'Acid orb',
  'poison-orb': 'Poison orb',
  'arcane-orb': 'Arcane orb',
  'psychic-orb': 'Psychic orb',
  'shadow-orb': 'Shadow orb',
  lightning: 'Lightning bolt',
  'eldritch-beam': 'Eldritch beam',
  'holy-light': 'Holy light',
  'dark-pall': 'Dark pall',
  none: 'No animation',
} as const;
export type AnimationId = keyof typeof ANIMATIONS;
export const ANIMATION_IDS = Object.keys(ANIMATIONS) as AnimationId[];
export const AnimationIdSchema = z.enum(ANIMATION_IDS as [AnimationId, ...AnimationId[]]);

/** What a creature's animation choice is keyed by: "attack:Longsword", "spell:fire-bolt". */
export const animationRef = (kind: 'attack' | 'spell', id: string) => `${kind}:${id}`;

/** A video animation of the game's assets or a pack (a JB2A pack's .webm files). */
const MEDIA_ANIMATION = /^(pack:\/\/[a-z0-9][a-z0-9-]*\/|\/assets\/)[^?#]+\.(webm|mp4)$/i;

export const isMediaAnimation = (choice: string): boolean => MEDIA_ANIMATION.test(choice);

/** What a creature may pick for an attack or spell: a library animation, or a video by its src. */
export const AnimationChoiceSchema = z.union([
  AnimationIdSchema,
  z.string().max(300).regex(MEDIA_ANIMATION, 'a library animation, or a .webm video of the assets or a pack'),
]);
