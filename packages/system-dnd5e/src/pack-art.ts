import { type ArtIndex, type MediaEntry, mergeArt, nameKey } from '@vtt/core';
import { srdFor } from './content.ts';
import { ConditionSchema } from './spell-schema.ts';
import { packAnimations } from './pack-animations.ts';

// D&D's reading of a pack's media (SystemDefinition.packArt): which pictures
// are icons for spells, items, features and conditions, which are monster
// tokens, and which videos animate spells and attacks. Matched by name, so
// turning on a pack of icons or JB2A's animations needs no picking:
//   - a picture named like an SRD spell, item or condition ("chest.svg",
//     "blinded.svg") is its icon; in a folder named for a kind ("items/",
//     "spells/", "features/", "conditions/" or "statuses/") any picture is,
//     by its file name;
//   - a picture under a folder with "token" in its name is the token of the
//     monster it is named after ("tokens/undead/Skeleton.webp");
//   - videos: see pack-animations.ts.

/** Folder words that say what the pictures in them are. */
const FOLDER_SLOTS: Record<string, string> = {
  spells: 'spell',
  items: 'item',
  features: 'feature',
  feats: 'feature',
  conditions: 'condition',
  statuses: 'condition',
};

const both = (pick: (edition: '2014' | '2024') => Iterable<string>) => new Set([...pick('2014'), ...pick('2024')]);

/** The SRD's ids, by slot, for pictures named after them. */
const KNOWN: [string, ReadonlySet<string>][] = [
  ['spell', both((e) => srdFor(e).spells.keys())],
  ['item', both((e) => srdFor(e).items.keys())],
  ['condition', new Set(ConditionSchema.options)],
];

/** The slot a picture fills by its folders, if they name one. */
function folderSlot(m: MediaEntry): string | undefined {
  if (m.tags.some((t) => t.includes('token'))) return 'monster';
  for (const tag of [...m.tags].reverse()) {
    const slot = FOLDER_SLOTS[tag];
    if (slot) return slot;
  }
  return undefined;
}

function pictureSlot(m: MediaEntry, key: string): string | undefined {
  return folderSlot(m) ?? KNOWN.find(([, ids]) => ids.has(key))?.[0];
}

/** A small copy of another picture (a "thumbs" folder, a "_Thumb" name): never the icon itself. */
const isThumb = (m: MediaEntry) => /thumb/i.test(m.name) || m.tags.some((t) => t === 'thumbs' || t === 'thumbnails');

/** Icons and tokens: each picture under the slot its folder or name says, the first of a name winning. */
function pictureArt(media: readonly MediaEntry[]): ArtIndex {
  const out: ArtIndex = {};
  for (const m of media) {
    if (m.kind !== 'image' || isThumb(m)) continue;
    const key = nameKey(m.name);
    const slot = pictureSlot(m, key);
    if (!slot) continue;
    out[slot] ??= {};
    out[slot][key] ??= [m.src];
  }
  return out;
}

const MONSTERS = both((e) => srdFor(e).monsters.keys());
const FILLER = new Set(['of', 'the', 'a']);
const wordsOf = (key: string) => key.split('-').filter((w) => !FILLER.has(w));
/** A name with its words in any order and without "of": "BlackDragonAdult" and "SwarmBats" find adult black dragon and swarm of bats. */
const looseKey = (key: string) =>
  wordsOf(key)
    .sort((a, b) => a.localeCompare(b))
    .join('-');

/** A token for an SRD monster whose picture is named loosely: words in another order, or more of them ("CatOrange"). */
function looseMonster(
  id: string,
  tokens: Record<string, string[]>,
  loose: Map<string, string[]>,
): string[] | undefined {
  const exact = loose.get(looseKey(id));
  if (exact) return exact;
  const want = wordsOf(id);
  const key = Object.keys(tokens).find((k) => want.every((w, i) => wordsOf(k)[i] === w));
  return key ? tokens[key] : undefined;
}

/** A creature in a role (a goblin boss, a guard captain) wears the creature's token. */
const ROLE =
  /^([a-z-]+)-(boss|captain|warrior|stalker|sentinel|trooper|fanatic|minion|skirmisher|acolyte|chieftain|shaman|leader)$/;

/** Gives the SRD monsters without a token of their own name one named loosely. */
function withLooseMonsters(art: ArtIndex): ArtIndex {
  const tokens = art.monster;
  if (!tokens) return art;
  const loose = new Map<string, string[]>();
  for (const [key, srcs] of Object.entries(tokens)) if (!loose.has(looseKey(key))) loose.set(looseKey(key), srcs);
  const filled = { ...tokens };
  for (const id of MONSTERS) {
    if (filled[id]) continue;
    const kind = ROLE.exec(id)?.[1];
    const found = looseMonster(id, tokens, loose) ?? (kind ? looseMonster(kind, tokens, loose) : undefined);
    if (found) filled[id] = found;
  }
  return { ...art, monster: filled };
}

/** What a pack's media offer the game's content, matched by name. */
export function dnd5ePackArt(media: readonly MediaEntry[]): ArtIndex {
  return mergeArt([withLooseMonsters(pictureArt(media)), { animation: packAnimations(media) }]);
}
