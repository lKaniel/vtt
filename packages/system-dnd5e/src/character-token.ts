import { type Character, characterToken } from './character.ts';
import { type Point, withLevel } from '@vtt/shared';
import { type Token, TokenSchema } from './token-schema.ts';

// Putting a player's character on the map, and keeping that token in step
// when the character levels up.

/** The empty square nearest `start` (spiralling out), as a square centre. */
export function freeSquare(start: Point, taken: readonly Point[], gridSize: number): Point {
  const col = Math.floor(start[0] / gridSize);
  const row = Math.floor(start[1] / gridSize);
  const used = new Set(taken.map(([x, y]) => `${Math.floor(x / gridSize)},${Math.floor(y / gridSize)}`));
  for (let ring = 0; ring < 50; ring++) {
    for (const [c, r] of ringSquares(col, row, ring)) {
      if (!used.has(`${c},${r}`)) return [(c + 0.5) * gridSize, (r + 0.5) * gridSize];
    }
  }
  return [(col + 0.5) * gridSize, (row + 0.5) * gridSize];
}

/** The squares `ring` steps away from (col, row), starting east. */
function ringSquares(col: number, row: number, ring: number): [number, number][] {
  if (ring === 0) return [[col, row]];
  const out: [number, number][] = [];
  for (let d = -ring; d <= ring; d++) {
    out.push([col + ring, row + d], [col - ring, row + d]);
    if (Math.abs(d) < ring) out.push([col + d, row - ring], [col + d, row + ring]);
  }
  return out.sort((a, b) => Math.abs(a[1] - row) - Math.abs(b[1] - row));
}

/** What the GM may dress a token in: kept on the map unless the player changes it on the character. */
const LOOK = ['name', 'color', 'img', 'size'] as const;
type Look = Pick<Token, (typeof LOOK)[number]>;

/** The look fields the character changed since `previous` (none without one). */
function lookChanges(c: Character, previous: Character | undefined): Partial<Look> {
  if (!previous) return {};
  const now = characterToken(c);
  const was = characterToken(previous);
  return Object.fromEntries(LOOK.filter((k) => now[k] !== was[k]).map((k) => [k, now[k]]));
}

/**
 * The character's token, linked to an actor of the same id: a new one at `at`, or `existing` with its build
 * (stats, speed, senses) refreshed. Play state stays as it is: position, hit points, inventory, effects,
 * spent slots, hotbar. So does its look (name, picture, colour, size), which the GM may have edited,
 * except what the player changed on the character since `previous`.
 */
export function characterOnMap(c: Character, existing: Token | undefined, at: Point, previous?: Character): Token {
  const { inventory, ownership, ...build } = characterToken(c);
  if (!existing) {
    return TokenSchema.parse({
      id: c.id,
      x: at[0],
      y: at[1],
      ...build,
      inventory,
      ownership,
      actor: c.id,
      linked: true,
    });
  }
  const look: Look = { name: existing.name, color: existing.color, img: existing.img, size: existing.size };
  return TokenSchema.parse({
    ...existing,
    ...build,
    ...look,
    ...lookChanges(c, previous),
    hidden: existing.hidden,
    ownership: withLevel(existing.ownership, c.owner, 'owner'),
    stats: { ...existing.stats, ...build.stats },
  });
}

/** The character's token on the map again: it stays as it is, only made sure to be the player's. */
export function characterBack(c: Character, existing: Token): Token {
  return { ...existing, ownership: withLevel(existing.ownership, c.owner, 'owner') };
}
