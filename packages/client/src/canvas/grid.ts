import { isGridless, type Rect, type WorldInfo } from '@vtt/shared';
import type { Graphics } from 'pixi.js';

/** Below this zoom the grid is skipped, so a zoomed-out map stays cheap. */
const GRID_LOD = 0.35;

/** Draws the scene's grid lines over `r` (none unless the scene has a square grid), fading in as you zoom closer. */
export function drawGrid(g: Graphics, world: WorldInfo, r: Rect, zoom: number): void {
  g.clear();
  if (zoom < GRID_LOD || isGridless(world)) return;
  const size = world.gridSize;
  for (let x = Math.floor(r.x / size) * size; x <= r.x + r.w; x += size) g.moveTo(x, r.y).lineTo(x, r.y + r.h);
  for (let y = Math.floor(r.y / size) * size; y <= r.y + r.h; y += size) g.moveTo(r.x, y).lineTo(r.x + r.w, y);
  const alpha = (world.gridOpacity ?? 0.16) * Math.min(1, (zoom - GRID_LOD) / 0.25);
  g.stroke({ width: 1 / zoom, color: world.gridColor ?? '#000000', alpha });
}
