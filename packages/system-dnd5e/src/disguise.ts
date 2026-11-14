import { type Look, type Token } from './token-schema.ts';

// Disguises: a creature keeps several looks (a picture and the name others
// know it by) and wears one at a time. Its owners and the GM are told
// everything and see both; everyone else is told only the worn look, as if it
// were the creature's own (viewToken), and the chat names it by that name.

type Wearer = Pick<Token, 'name' | 'img' | 'looks' | 'look'>;

/** The look it wears now, if any. */
export function activeLook(token: Pick<Token, 'looks' | 'look'>): Look | undefined {
  return token.look ? token.looks?.find((l) => l.id === token.look) : undefined;
}

/** The name others know it by now. */
export const shownName = (token: Wearer): string => activeLook(token)?.name ?? token.name;

/** The picture others see now. */
export const shownImg = (token: Wearer): string | undefined => activeLook(token)?.img ?? token.img;

/** `token` as someone who doesn't know the disguise is told about it: the worn look as its own, no others. */
export function disguised<T extends Wearer>(token: T): Omit<T, 'looks' | 'look'> {
  const { looks: _l, look: _k, ...rest } = token;
  const worn = activeLook(token);
  if (!worn) return rest;
  return { ...rest, name: worn.name ?? token.name, ...(worn.img && { img: worn.img }) };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches `word` standing on its own, not inside another word. */
const wordOf = (word: string) => new RegExp(String.raw`(?<![\p{L}\p{N}])${escape(word)}(?![\p{L}\p{N}])`, 'gu');

/**
 * `text` with each disguised creature's own name changed to the one it goes by
 * now. Text already naming the disguise stays as it is, so it can be sent again.
 */
export function disguiseText(text: string, tokens: Iterable<Wearer>): string {
  let out = text;
  for (const token of tokens) {
    const name = activeLook(token)?.name;
    if (!name || name === token.name) continue;
    const parts = out.split(name).map((part) => part.replace(wordOf(token.name), name));
    out = parts.join(name);
  }
  return out;
}
