import { type ArtIndex, artOf, nameKey } from '@vtt/core';
import { assetUrl } from '../assets.ts';

// The pictures and animations the game's packs offer its content (the
// server sends them with `packContent`, see core/pack-art.ts): icons for
// spells, items, features and conditions, monster tokens, and videos for
// spells and attacks. icon-art.ts and feedback.ts ask here first, so a pack
// turned on shows everywhere those are drawn.

let art: ArtIndex = {};

export function setPackArt(next: ArtIndex): void {
  art = next;
}

/**
 * The keys to look a thing up by: its id, its name, then (for gear, `words`)
 * each word of its name from the last ("Flame Tongue Longsword", "+1 Longsword" → longsword).
 */
function lookupKeys(id: string | undefined, name?: string, words = false): string[] {
  const named = name ? nameKey(name) : '';
  const each = words ? named.split('-').filter((w) => w.length > 2) : [];
  return [...new Set([id ?? '', named, ...each.toReversed()].filter(Boolean))];
}

/** Slots whose things are named after what they are made from, so a word of the name may find them. */
const BY_WORD = new Set(['item']);

/** A pack picture for a thing in `slot` ("spell", "item", "feature", "condition", "monster"), as a URL. */
export function packPicture(slot: string, id: string | undefined, name?: string): string | undefined {
  const found = artOf(art, slot, ...lookupKeys(id, name, BY_WORD.has(slot)))?.[0];
  return found && assetUrl(found);
}

/**
 * The videos the packs have for an attack ("melee"/"ranged" and its name)
 * or a spell (its id); a spell that heals falls back to healing's.
 */
export function packAnimation(
  kind: 'melee' | 'ranged' | 'spell',
  idOrName: string,
  opts: { heals?: boolean } = {},
): string[] | undefined {
  const keys = kind === 'spell' ? [idOrName] : lookupKeys(undefined, idOrName, true);
  const own = artOf(art, 'animation', ...keys.map((k) => `${kind}:${k}`));
  return own ?? (opts.heals ? artOf(art, 'animation', 'heal') : undefined);
}
