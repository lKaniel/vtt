import { castCharges, itemCasts, type ItemSpell, type Spell, type TokenView } from '@vtt/system-dnd5e';
import { contentFor } from '../content/content.ts';
import { spellArt } from '../icon-art.ts';
import { spellIcon } from '../icons.ts';
import type { ActionTile } from './actions.ts';
import { aimSpell, type Aiming } from './targeting.ts';

// Spells cast from magic items (a wand of fireballs, a staff of healing):
// tiles on the action bar with the charges left, the slot levels the
// charges allow, and aiming that sends the item along.

function found(token: TokenView, index: number, spellId: string): { cast: ItemSpell; spell: Spell } | undefined {
  const content = contentFor(token);
  const cast = itemCasts(token, content).find((c) => c.index === index && c.spell === spellId);
  const spell = content.spells.get(spellId);
  return cast && spell ? { cast, spell } : undefined;
}

/** The slot levels the item can cast the spell at with the charges it has. */
function slotsOf(cast: ItemSpell, spell: Spell): number[] {
  if (spell.level === 0) return [0];
  if (cast.level !== undefined || cast.cost !== 'level') return [cast.level ?? spell.level];
  const lowest = Math.max(spell.level, (cast.less ?? 0) + 1);
  const levels = Array.from({ length: 10 - lowest }, (_, i) => lowest + i);
  const left = cast.left ?? Infinity;
  const affordable = levels.filter((l) => castCharges(cast, l) <= left);
  return affordable.length ? affordable : [lowest];
}

/** The slot levels `token` can cast the item's spell at. */
export function itemSlots(token: TokenView, index: number, spellId: string): number[] {
  const at = found(token, index, spellId);
  return at ? slotsOf(at.cast, at.spell) : [];
}

function spent(cast: ItemSpell, spell: Spell, token: TokenView): boolean {
  if (cast.daily) return !!token.inventory?.[cast.index]?.usedToday?.includes(spell.id);
  const lowest = slotsOf(cast, spell)[0]!;
  return cast.left !== undefined && castCharges(cast, lowest) > cast.left;
}

/** One tile per spell the token's working items cast, named after the item. */
export function itemSpellTiles(token: TokenView): ActionTile[] {
  const content = contentFor(token);
  return itemCasts(token, content).flatMap((cast) => {
    const spell = content.spells.get(cast.spell);
    const item = content.items.get(cast.item);
    if (!spell || !item) return [];
    const left = cast.left === undefined ? undefined : String(cast.left);
    const uses = cast.daily ? '1/day' : left;
    const tile: ActionTile = {
      kind: 'spell',
      name: `${spell.name} (${item.name})`,
      icon: { ...spellIcon(spell), art: spellArt(spell) },
      spent: spent(cast, spell, token),
      spell,
      slot: slotsOf(cast, spell)[0],
      item: cast.index,
      ...(uses && { uses }),
    };
    return [tile];
  });
}

/** Aims the item's spell at `slot` (its lowest when missing). */
export function itemAiming(
  token: TokenView | undefined,
  index: number,
  spellId: string,
  slot?: number,
): Aiming | undefined {
  const at = token && found(token, index, spellId);
  if (!at) return undefined;
  const level = slot ?? slotsOf(at.cast, at.spell)[0]!;
  return { ...aimSpell(at.spell, level, token.sheet?.caster?.level ?? 1), item: index };
}
