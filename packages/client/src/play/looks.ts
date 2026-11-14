import { type Look, shownName, type TokenView } from '@vtt/system-dnd5e';

// Disguises on the table (system-dnd5e disguise.ts): a creature's other
// looks, the one it wears, and how the map names it for those who know.

/** The name the map shows, and its own name beside it for its owners and the GM while it's disguised. */
export function mapName(token: Pick<TokenView, 'name' | 'looks' | 'look'>): { name: string; really?: string } {
  const name = shownName(token);
  return name === token.name ? { name } : { name, really: token.name };
}

/** A new look for the list, numbered after the others, wearing `img` to start with. */
export function newLook(looks: readonly Look[] | undefined, word: string, img?: string): Look {
  const taken = new Set((looks ?? []).map((l) => l.id));
  let n = (looks?.length ?? 0) + 1;
  while (taken.has(`look-${n}`)) n++;
  return { id: `look-${n}`, label: `${word} ${n}`, ...(img && { img }) };
}

/** The token edit that puts on look `id`, or takes the disguise off (''). */
export const wearPatch = (id: string) => ({ look: id || null });
