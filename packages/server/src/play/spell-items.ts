import {
  type CasterSheet,
  characterLevel,
  scrollCaster,
  scrollProblem,
  type Content,
  itemCaster,
  itemCastProblem,
  type ItemCastPick,
  type Spell,
  spendItemCast,
  SPELL_SCROLL,
  type Token,
} from '@vtt/system-dnd5e';
import { Refusal, type Fighter } from './table.ts';

// Spells cast from what a creature carries: a scroll it reads, a wand or a
// staff whose charges pay instead of a slot.

/** Which item and spell, and the spellcasting it goes off with (the item's own DC when it has one). */
export function itemCasting(
  content: Content,
  actor: Fighter,
  spell: Spell,
  req: { item: number; slot: number },
): { pick: ItemCastPick; reader: CasterSheet } {
  const pick = { index: req.item, spell: spell.id, slot: spell.level === 0 ? 0 : req.slot };
  const problem = itemCastProblem(actor.token, content, pick);
  if (problem) throw new Refusal(`${actor.token.name} ${problem}`);
  const item = content.items.get(actor.token.inventory![pick.index]!.item)!;
  return { pick, reader: itemCaster(actor.sheet, item, spell) };
}

/** The caster with what it cast from used: a scroll crumbles (`from` true), a wand at inventory `from` loses charges. */
export function spentFrom(
  token: Token,
  content: Content,
  cast: { spell: Spell; slot: number },
  from: boolean | number,
): Token {
  if (typeof from === 'number')
    return spendItemCast(token, content, { index: from, spell: cast.spell.id, slot: cast.slot });
  return from ? useScroll(token, cast.spell.id) : token;
}

/** One scroll of `spell` fewer: it crumbles to dust. */
function useScroll(token: Token, spell: string): Token {
  const list = token.inventory ?? [];
  const at = list.findIndex((e) => e.item === SPELL_SCROLL && e.spell === spell);
  const entry = list[at]!;
  const inventory =
    entry.qty > 1 ? list.map((e, i) => (i === at ? { ...e, qty: e.qty - 1 } : e)) : list.filter((_, i) => i !== at);
  return { ...token, inventory: inventory.length ? inventory : undefined };
}

/** The spellcasting `caster` reads a scroll of `spell` with; refused without such a scroll, or one it can't read. */
export function scrollReader({ token, sheet }: Fighter, spell: Spell, content: Content): CasterSheet {
  if (!token.inventory?.some((e) => e.item === SPELL_SCROLL && e.spell === spell.id)) {
    throw new Refusal(`${token.name} has no scroll of ${spell.name}`);
  }
  const problem = scrollProblem(token, spell, content);
  if (problem) throw new Refusal(`${token.name} ${problem}`);
  return scrollCaster(sheet, spell, characterLevel(token.stats) ?? 1);
}
