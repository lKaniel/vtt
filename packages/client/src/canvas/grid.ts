import { chunkKey, isGridless, type Rect, type WorldInfo } from '@vtt/shared';
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

/** Extra chunks loaded around the screen, so panning doesn't show holes. */
const CHUNK_MARGIN = 1;
/** Beyond this many chunks across, keep what's loaded instead of asking for more. */
const MAX_CHUNK_SPAN = 24;

/** The keys of the chunks over `r` and a margin around it; undefined when zoomed out too far to ask for more. */
export function chunksInView(r: Rect, size: number): string[] | undefined {
  const cx0 = Math.floor(r.x / size) - CHUNK_MARGIN;
  const cy0 = Math.floor(r.y / size) - CHUNK_MARGIN;
  const cx1 = Math.floor((r.x + r.w) / size) + CHUNK_MARGIN;
  const cy1 = Math.floor((r.y + r.h) / size) + CHUNK_MARGIN;
  if (Math.max(cx1 - cx0, cy1 - cy0) > MAX_CHUNK_SPAN) return undefined;
  const keys: string[] = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) keys.push(chunkKey(cx, cy));
  return keys;
}
