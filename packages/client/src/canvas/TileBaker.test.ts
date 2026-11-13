import { Container, type Renderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { type Piece, TileBaker } from './TileBaker.ts';
import { BAKE_CELL } from './tile-bake.ts';

// The baker hides the pieces off the cell it is drawing. A roof leaves the
// bake to fade and comes back when fully drawn, so what a bake or the map's
// culling left on a piece must never keep it from being drawn again.

/** A piece `size` wide in cell `[cx, 0]`. */
function piece(cx: number, size = 200): Piece {
  return { root: new Container(), bounds: { x: cx * BAKE_CELL + 100, y: 100, w: size, h: size } };
}

/** A baker looking at the first two cells, and which pieces showed in each picture it drew. */
function baking() {
  const drawn: boolean[][] = [];
  const watched: Piece[] = [];
  const renderer = { render: () => drawn.push(watched.map((p) => p.root.visible && !p.root.culled)) };
  const baker = new TileBaker();
  baker.setView({ x: 0, y: 0, w: 2 * BAKE_CELL, h: BAKE_CELL }, 1, renderer as unknown as Renderer);
  return { baker, drawn, watched };
}

describe('the tile baker', () => {
  it('draws into each cell only the pieces over it', () => {
    const { baker, drawn, watched } = baking();
    const [left, right] = [piece(0), piece(1)];
    watched.push(left, right);
    baker.layout([{ key: '', pieces: [left, right] }]);
    baker.tick();
    expect(drawn).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it('leaves its pieces showing, so one that goes live (a roof starting to fade) is seen', () => {
    const { baker } = baking();
    const [left, right] = [piece(0), piece(1)];
    baker.layout([{ key: '', pieces: [left, right] }]);
    baker.tick();
    expect([left.root.visible, right.root.visible]).toEqual([true, true]);
  });

  it('draws a piece the map culled while it was live', () => {
    const { baker, drawn, watched } = baking();
    const roof = piece(0);
    roof.root.culled = true;
    watched.push(roof);
    baker.layout([{ key: '', pieces: [roof] }]);
    baker.tick();
    expect(drawn).toEqual([[true]]);
  });
});
