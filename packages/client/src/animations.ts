import type { MediaEntry } from '@vtt/core';
import { type AnimationId, isMediaAnimation } from '@vtt/system-dnd5e';
import type { Element } from './feedback.ts';
import { readPref, writePref } from './prefs.ts';

// The animation library (Sequencer and Automated Animations, built in): what
// each named animation looks like, as a way to deliver the blow and the
// element that colours it. feedback.ts turns them into cues.

/** How the blow gets to its target: a swing, something that flies, light that falls on it, or nothing. */
export type Delivery = 'swing' | 'arrow' | 'orb' | 'bolt' | 'fall' | 'video' | 'none';

export interface Animation {
  delivery: Delivery;
  /** Missing keeps the colour of the damage. */
  element?: Element;
  /** A video's src (a JB2A pack's .webm), for `video`. */
  src?: string;
}

const LIBRARY: Record<AnimationId, Animation> = {
  blade: { delivery: 'swing', element: 'steel' },
  'flame-blade': { delivery: 'swing', element: 'fire' },
  'frost-blade': { delivery: 'swing', element: 'cold' },
  'storm-blade': { delivery: 'swing', element: 'lightning' },
  'acid-blade': { delivery: 'swing', element: 'acid' },
  'radiant-blade': { delivery: 'swing', element: 'radiant' },
  'shadow-blade': { delivery: 'swing', element: 'necrotic' },
  arrow: { delivery: 'arrow', element: 'steel' },
  'fire-arrow': { delivery: 'arrow', element: 'fire' },
  'frost-arrow': { delivery: 'arrow', element: 'cold' },
  'poison-arrow': { delivery: 'arrow', element: 'poison' },
  'fire-orb': { delivery: 'orb', element: 'fire' },
  'frost-orb': { delivery: 'orb', element: 'cold' },
  'acid-orb': { delivery: 'orb', element: 'acid' },
  'poison-orb': { delivery: 'orb', element: 'poison' },
  'arcane-orb': { delivery: 'orb', element: 'arcane' },
  'psychic-orb': { delivery: 'orb', element: 'psychic' },
  'shadow-orb': { delivery: 'orb', element: 'necrotic' },
  lightning: { delivery: 'bolt', element: 'lightning' },
  'eldritch-beam': { delivery: 'bolt', element: 'force' },
  'holy-light': { delivery: 'fall', element: 'radiant' },
  'dark-pall': { delivery: 'fall', element: 'necrotic' },
  none: { delivery: 'none' },
};

/** The animation a log names, or undefined for the default (or an id this client doesn't know). */
export function animationOf(id: string | undefined): Animation | undefined {
  if (id && isMediaAnimation(id)) return { delivery: 'video', src: id };
  return id ? LIBRARY[id as AnimationId] : undefined;
}

/**
 * Whether a video flies from the attacker to its target (stretched between
 * them) rather than playing on the target: JB2A names its projectiles by
 * range ("…_30ft_…") or keeps them under a "Ranged" folder.
 */
export const isRangedVideo = (src: string): boolean => /ranged|_\d+ft_/i.test(src);

/** How much of the animations a player wants to see (their own option, kept in this browser). */
export type Motion = 'full' | 'reduced' | 'off';

export const MOTIONS: readonly Motion[] = ['full', 'reduced', 'off'];

/** This browser's choice of how much animation to play. */
export const currentMotion = (): Motion => readPref('motion', MOTIONS, 'full');
export const setMotion = (motion: Motion): void => writePref('motion', motion);

/** Videos whose path holds every word of `query`, the first `limit` of them, for the animation picker. */
export function videoChoices(media: readonly MediaEntry[], query: string, limit = 40): MediaEntry[] {
  const words = query
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean);
  const videos = media.filter((m) => m.kind === 'video' && isMediaAnimation(m.src));
  const hits = videos.filter((m) => words.every((w) => m.src.toLowerCase().includes(w)));
  return hits.slice(0, limit);
}
