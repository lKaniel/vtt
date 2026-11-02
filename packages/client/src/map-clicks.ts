import { bodyOf, isParty, type Body, type Point } from '@vtt/shared';
import type { MenuItem } from './editor/menus.ts';
import type { Session } from './session.ts';

// What a plain left click on the map does in the tokens mode (no spell aimed,
// no attack readied): on empty ground the selected creatures walk there; on a
// creature you control it becomes the selection; on a foe in a fight you are
// asked whether to attack it or walk up to it; on a pile of loot or a
// merchant whether to open it or walk up to it; on anyone else nothing.

interface Placed {
  id: string;
  x: number;
  y: number;
}

/** Room left between two creatures that walk up to each other (map pixels). */
const WALK_UP_GAP = 2;

/**
 * Where each creature goes when `lead` walks to `at`: the others keep their
 * places around it. The ones in front go first, so no one walks into a friend
 * who hasn't moved yet.
 */
export function formationMoves(group: readonly Placed[], lead: string, at: Point): { id: string; to: Point }[] {
  const leader = group.find((t) => t.id === lead);
  if (!leader) return [];
  const [dx, dy] = [at[0] - leader.x, at[1] - leader.y];
  const ahead = (t: Placed) => t.x * dx + t.y * dy;
  return [...group].sort((a, b) => ahead(b) - ahead(a)).map((t) => ({ id: t.id, to: [t.x + dx, t.y + dy] as Point }));
}

/** Where `from` stops when it walks up to `to`: just outside it, on the near side; where it stands if it is already there. */
export function walkUpPoint(from: Body, to: Body): Point {
  const [dx, dy] = [from.x - to.x, from.y - to.y];
  const d = Math.hypot(dx, dy);
  const reach = from.r + to.r + WALK_UP_GAP;
  if (d <= reach || d === 0) return [from.x, from.y];
  return [to.x + (dx / d) * reach, to.y + (dy / d) * reach];
}

/** The selected creatures you control, and the one that leads them (the one you act with). */
function selectedGroup(s: Session): { group: Placed[]; lead?: string } {
  const group = [...s.tokens.values()].filter((t) => s.isSelected(t.id) && s.canControl(t));
  const lead = group.some((t) => t.id === s.selected) ? s.selected : group[0]?.id;
  return { group, lead };
}

/** A click on empty ground: the selection walks there in formation. False when nothing of yours is selected. */
export function moveSelectionTo(s: Session, at: Point, lead?: string): boolean {
  const { group, lead: first } = selectedGroup(s);
  const leader = lead && group.some((t) => t.id === lead) ? lead : first;
  if (!leader) return false;
  for (const m of formationMoves(group, leader, at)) s.move(m.id, m.to);
  return true;
}

export type TokenClick = { kind: 'select' } | { kind: 'none' } | { kind: 'prompt'; items: MenuItem[] };

/** A foe in the fight going on: someone in the turn order the players don't own. */
function isFoeInFight(s: Session, id: string): boolean {
  const combat = s.combat;
  const target = s.tokens.get(id);
  if (!combat || combat.peaceful || !target) return false;
  return !isParty(target) && combat.order.some((e) => e.token === id);
}

/** What the creature you act with may do to a foe: each of its attacks, or walk up to it. */
function foeOptions(s: Session, target: string): MenuItem[] {
  const self = s.selected ? s.tokens.get(s.selected) : undefined;
  if (!self || !s.canControl(self)) return [];
  const attacks = (self.sheet?.attacks ?? []).map((a) => ({
    label: `Attack: ${a.name}`,
    run: () => {
      s.arm(a.name);
      s.attack(target);
    },
  }));
  const walkUp = {
    label: 'Interact (walk up to it)',
    run: () => walkUpTo(s, self.id, target),
  };
  return [...attacks, walkUp];
}

/** The creature you act with walks up next to `target`. */
function walkUpTo(s: Session, id: string, target: string): void {
  const [self, other] = [s.tokens.get(id), s.tokens.get(target)];
  const g = s.world?.gridSize ?? 100;
  if (self && other) s.move(id, walkUpPoint(bodyOf(self, g), bodyOf(other, g)));
}

/** A pile of loot or a merchant: open its window, or walk up to it. */
function pileOptions(s: Session, id: string): MenuItem[] {
  const self = s.selected ? s.tokens.get(s.selected) : undefined;
  const name = s.tokens.get(id)?.name ?? 'it';
  const open = { label: `Open ${name}`, run: () => s.openPile(id) };
  if (!self || !s.canControl(self)) return [open];
  return [open, { label: 'Walk up to it', run: () => walkUpTo(s, self.id, id) }];
}

/** What a plain left click on a creature does (see the top of this file). */
export function clickToken(s: Session, id: string): TokenClick {
  const t = s.tokens.get(id);
  if (!t) return { kind: 'none' };
  if (s.canControl(t)) return { kind: 'select' };
  if (t.pile) return { kind: 'prompt', items: pileOptions(s, id) };
  if (!isFoeInFight(s, id)) return { kind: 'none' };
  const items = foeOptions(s, id);
  return items.length ? { kind: 'prompt', items } : { kind: 'none' };
}
