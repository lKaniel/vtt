import type { Attack, FeatureSheet, Spell } from '@vtt/shared';
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
