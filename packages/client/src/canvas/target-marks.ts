import type { Graphics } from 'pixi.js';
import type { Targeter } from '../targets.ts';

// The marks on a targeted creature: four arrowheads closing in on it in the
// colour of whoever targets it (you first), and a pip over it for each
// player who does.

/** Where a token is drawn now, and its disc radius. */
export type PlaceOf = (id: string) => { at: [number, number]; r: number } | undefined;

const OUTLINE = 0x000000;
/** Arrowhead size and pip radius, in screen pixels. */
const ARROW = 11;
const PIP = 4.5;

/** Draws the marks of every targeted token; `px` is one screen pixel in world units. */
export function drawTargets(g: Graphics, marks: Iterable<[string, Targeter[]]>, placeOf: PlaceOf, px: number): void {
  for (const [id, who] of marks) {
    const place = placeOf(id);
    if (!place || who.length === 0) continue;
    const spot = { x: place.at[0], y: place.at[1], r: place.r, px };
    drawArrows(g, spot, who[0]!.color);
    drawPips(g, spot, who);
  }
}

/** A token's centre and radius, and one screen pixel, in world units. */
interface Spot {
  x: number;
  y: number;
  r: number;
  px: number;
}

function drawArrows(g: Graphics, { x, y, r, px }: Spot, color: string): void {
  const out = r * 1.2 + ARROW * px;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const [dx, dy] = [Math.cos(a), Math.sin(a)];
    const tip: [number, number] = [x + dx * (out - ARROW * px), y + dy * (out - ARROW * px)];
    const side = (ARROW * px) / 1.6;
    const shape = [
      tip[0],
      tip[1],
      x + dx * out - dy * side,
      y + dy * out + dx * side,
      x + dx * out + dy * side,
      y + dy * out - dx * side,
    ];
    g.poly(shape)
      .fill({ color })
      .stroke({ width: 1.5 * px, color: OUTLINE });
  }
}

function drawPips(g: Graphics, { x, y, r, px }: Spot, who: Targeter[]): void {
  const gap = PIP * 2.6 * px;
  const top = y - r * 1.2 - ARROW * px - PIP * 2 * px;
  who.forEach((t, i) => {
    const cx = x + (i - (who.length - 1) / 2) * gap;
    g.circle(cx, top, PIP * px)
      .fill({ color: t.color })
      .stroke({ width: 1.5 * px, color: OUTLINE });
  });
}
