// Flanking, the DMG's optional rule (a game setting, off unless the GM turns
// it on): a melee attacker has advantage when an ally that can act stands
// within 5 feet of the target on its opposite side. "Opposite" is read as
// the two lines from the target's centre to theirs pointing more than 135°
// apart, which on a grid is the DMG's line through opposite sides or corners.

interface Placed {
  x: number;
  y: number;
}

/** cos 135°, a hair past it so a knight-move angle doesn't count. */
const OPPOSITE = -Math.SQRT1_2 - 1e-6;

/** Whether the attacker and its ally stand on opposite sides of the target. */
export function flanks(attacker: Placed, ally: Placed, target: Placed): boolean {
  const [ax, ay] = [attacker.x - target.x, attacker.y - target.y];
  const [bx, by] = [ally.x - target.x, ally.y - target.y];
  const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);
  return lengths > 0 && (ax * bx + ay * by) / lengths < OPPOSITE;
}
