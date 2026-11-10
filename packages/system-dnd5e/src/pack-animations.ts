import { type MediaEntry, nameKey } from '@vtt/core';
import { srdFor } from './content.ts';
import type { Spell } from './spell-schema.ts';

// Which of a pack's videos animate which spell or attack, matched by name the
// way JB2A lays its library out, so nobody picks them per item:
//   - "spell:<id>": the videos in a folder named after the spell
//     (Library/3rd_Level/Fireball/);
//   - "melee:<weapon>", "ranged:<weapon>": videos under a Weapon_Attacks,
//     Unarmed_Attacks or Creature folder whose name holds the weapon
//     (MeleeAttack02_Mace01_..., Ranged/Arrow01_...); ranged when under a
//     Ranged folder or made in lengths ("_30ft_");
//   - "zone:<id>": the same folder's look for a lasting area, a loop if it has one;
//   - "heal": the videos of a Healing folder, for healing without its own;
//   - "condition:<id>": a loop under a Marker folder whose name holds the
//     condition's word (MarkerPoison_..., MarkerFear_...), worn by a creature
//     with that condition (effect-loops.ts).
// A spell or weapon gets one look: the same video in its sizes and lengths
// (the map picks the length nearest the shot), chosen in the colour of its
// damage, never a loop, a projectile for spells that fly and a burst for
// areas and touches.

interface Clip {
  src: string;
  /** The name without its size, length and take: one look of one effect. */
  look: string;
  /** Feet it flies, for projectiles made in lengths. */
  feet?: number;
  /** Width × height, to keep the largest. */
  size: number;
}

function clipOf(m: MediaEntry): Clip {
  const size = /_(\d+)x(\d+)$/i.exec(m.name);
  const feet = /_(\d+)ft(_|$)/i.exec(m.name);
  const look = m.name
    .replace(/_\d+x\d+$/i, '')
    .replace(/_\d+ft(?=_|$)/i, '')
    .replace(/(_\d+)+$/, '');
  return {
    src: m.src,
    look,
    ...(feet && { feet: Number(feet[1]) }),
    size: size ? Number(size[1]) * Number(size[2]) : 0,
  };
}

/** What a weapon's word in a video name stands for: the weapons (and natural attacks) it animates. */
const WEAPONS: Record<string, string[]> = {
  sword: ['longsword'],
  shortsword: ['shortsword'],
  greatsword: ['greatsword'],
  greataxe: ['greataxe'],
  handaxe: ['handaxe'],
  battleaxe: ['battleaxe'],
  warhammer: ['warhammer'],
  hammer: ['light-hammer'],
  mace: ['mace'],
  club: ['club'],
  greatclub: ['greatclub'],
  dagger: ['dagger'],
  rapier: ['rapier'],
  scimitar: ['scimitar'],
  spear: ['spear', 'pike', 'trident'],
  quarterstaff: ['quarterstaff'],
  glaive: ['glaive'],
  halberd: ['halberd'],
  maul: ['maul'],
  sickle: ['sickle'],
  flail: ['flail'],
  arrow: ['longbow', 'shortbow'],
  bolt: ['light-crossbow', 'heavy-crossbow', 'hand-crossbow'],
  bullet: ['sling'],
  dart: ['dart'],
  javelin: ['javelin'],
  unarmedstrike: ['unarmed-strike'],
  claw: ['claw', 'claws'],
  claws: ['claw', 'claws'],
  bite: ['bite'],
  fist: ['fist', 'slam'],
  pincer: ['pincer'],
  bouldertoss: ['rock'],
};

const ATTACK_FOLDERS = new Set(['weapon attacks', 'unarmed attacks', 'creature']);

/** A marker video's word, and the condition it shows. */
const MARKERS: Record<string, string> = {
  poison: 'poisoned',
  fear: 'frightened',
  charm: 'charmed',
  stun: 'stunned',
  sleep: 'unconscious',
  paralysis: 'paralyzed',
  restrain: 'restrained',
  blind: 'blinded',
};

/** The condition a marker loop shows, by the word after "Marker" in its name. */
function markerOf(m: MediaEntry): string | undefined {
  if (!m.tags.includes('marker') || !/loop/i.test(m.name)) return undefined;
  const word = /^marker([a-z]+)/i.exec(m.name)?.[1]?.toLowerCase();
  return word && Object.hasOwn(MARKERS, word) ? MARKERS[word] : undefined;
}

/** The weapons a video's name names: its parts ("MeleeAttack02", "Mace01"), then their words. */
function weaponsIn(name: string): string[] {
  if (/laser/i.test(name)) return [];
  const parts = name.split('_').map((p) => p.replace(/\d+/g, '').toLowerCase());
  const words = nameKey(name).split('-');
  const word = [...parts, ...words].find((w) => Object.hasOwn(WEAPONS, w));
  return word ? WEAPONS[word]! : [];
}

const SPELLS = new Map<string, Spell>([...srdFor('2024').spells, ...srdFor('2014').spells]);

/** The keys a video can animate. */
function keysOf(m: MediaEntry): string[] {
  const folder = nameKey(m.tags.at(-1) ?? '');
  if (SPELLS.has(folder)) return [`spell:${folder}`, `zone:${folder}`];
  const marker = markerOf(m);
  if (marker) return [`condition:${marker}`];
  if (/nohit/i.test(m.name)) return [];
  if (m.tags.some((t) => ATTACK_FOLDERS.has(t))) {
    const ranged = m.tags.includes('ranged') || /_\d+ft(_|$)/i.test(m.name);
    return weaponsIn(m.name).map((w) => `${ranged ? 'ranged' : 'melee'}:${w}`);
  }
  return m.tags.includes('healing') ? ['heal'] : [];
}

/** Colour words in video names, as each element prefers them, best first. */
const COLOURS: Record<string, string[]> = {
  fire: ['orange', 'red', 'yellow'],
  cold: ['blue', 'white'],
  lightning: ['blue', 'yellow', 'purple'],
  thunder: ['blue', 'white'],
  acid: ['green'],
  poison: ['green', 'purple'],
  necrotic: ['purple', 'black', 'green'],
  radiant: ['yellow', 'gold', 'white', 'orange'],
  force: ['purple', 'blue', 'pink'],
  psychic: ['pink', 'purple'],
  heal: ['green', 'blue'],
  arcane: ['purple', 'blue', 'pink'],
};
const ALL_COLOURS = new Set([...Object.values(COLOURS).flat(), 'grey', 'gray', 'dark']);

/** What a key wants of a look: its colours, whether an uncoloured one is best, and whether it flies. */
interface Want {
  colours: readonly string[];
  plain?: boolean;
  ranged?: boolean;
  /** A lasting area: a loop suits, a one-off doesn't. */
  loop?: boolean;
}

function spellWant(spell: Spell): Want {
  const element = spell.heal ? 'heal' : (spell.damage[0]?.type ?? 'arcane');
  return { colours: COLOURS[element] ?? [], ranged: !spell.area && spell.range > 5 };
}

function wantOf(key: string): Want {
  const [kind, id] = key.split(':');
  const spell = kind === 'spell' || kind === 'zone' ? SPELLS.get(id!) : undefined;
  if (spell && kind === 'zone') return { ...spellWant(spell), ranged: false, loop: true };
  if (spell) return spellWant(spell);
  if (key === 'heal') return { colours: COLOURS.heal! };
  if (kind === 'condition') return { colours: [], loop: true };
  return { colours: ['white', 'grey', 'blue'], plain: true, ranged: key.startsWith('ranged:') };
}

/** How well a look's colours suit: 0 best, 2 the wrong colour. */
function colourMisfit(words: readonly string[], want: Want): number {
  const coloured = words.filter((w) => [...ALL_COLOURS].some((c) => w.includes(c)));
  if (coloured.length === 0) return want.plain ? 0 : 1;
  const rank = want.colours.findIndex((c) => coloured.some((w) => w.includes(c)));
  if (rank < 0) return 2;
  const plainFirst = want.plain ? 1 : 0;
  return (rank + plainFirst) / 10;
}

/** A loop where a one-off is wanted is far off; a one-off for a lasting area will do. */
function loopMisfit(loops: boolean, wanted: boolean): number {
  if (loops === wanted) return 0;
  return wanted ? 3 : 8;
}

/** How far a look is from what is wanted; lower is better. A loop lasts, a source or intro is only part of it. */
function misfit(clips: readonly Clip[], want: Want): number {
  const look = clips[0]!.look;
  const words = look.toLowerCase().split(/[_\s]+/);
  const ranged = clips.some((c) => c.feet !== undefined);
  let score = loopMisfit(/loop/i.test(look), !!want.loop);
  if (want.ranged !== undefined && ranged !== want.ranged) score += 4;
  if (words.some((w) => ['dark', 'source', 'caster', 'glowing'].includes(w))) score += 1;
  return score + colourMisfit(words, want);
}

/** The best look's videos: one per length, the largest of each, shortest first. */
function bestLook(clips: readonly Clip[], want: Want): string[] {
  const looks = new Map<string, Clip[]>();
  for (const c of clips) looks.set(c.look, [...(looks.get(c.look) ?? []), c]);
  const [best] = [...looks.values()].sort((a, b) => misfit(a, want) - misfit(b, want));
  const byLength = new Map<number, Clip>();
  for (const c of best!) {
    const was = byLength.get(c.feet ?? 0);
    if (!was || c.size > was.size) byLength.set(c.feet ?? 0, c);
  }
  return [...byLength].sort((a, b) => a[0] - b[0]).map(([, c]) => c.src);
}

/** Animation keys ("spell:fireball", "melee:mace", "heal") → the videos to play. */
export function packAnimations(media: readonly MediaEntry[]): Record<string, string[]> {
  const found = new Map<string, Clip[]>();
  for (const m of media) {
    if (m.kind !== 'video') continue;
    for (const key of keysOf(m)) {
      const clips = found.get(key) ?? [];
      clips.push(clipOf(m));
      found.set(key, clips);
    }
  }
  return Object.fromEntries([...found].map(([key, clips]) => [key, bestLook(clips, wantOf(key))]));
}
