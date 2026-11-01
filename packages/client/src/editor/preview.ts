import type { Doc } from '@vtt/core';
import {
  applyPatch,
  applyTileEdit,
  dragHandle,
  isGroup,
  moveBy,
  scaleGroupEdit,
  snapDelta,
  tileBounds,
  withDescendants,
  withGroupBounds,
  type EditorMode,
  type Rect,
} from '@vtt/shared';
import { keyOf, refOf } from './selection.ts';
import type { Preview } from './controller.ts';

/** A document as a drag in progress would leave it, snapped the way the edit will be. */
export function previewDoc(
  key: string,
  doc: Doc,
  preview: Preview | undefined,
  ctx: { mode: EditorMode; gridSize: number },
): Doc {
  if (preview?.kind === 'move' && preview.keys.includes(key))
    return applyPatch(doc, moveBy(doc, snapDelta(preview.delta, ctx.mode, ctx.gridSize, preview.free)));
  if (preview?.kind === 'handle' && preview.key === key)
    return applyPatch(doc, dragHandle(doc, preview.handle, preview.to, { gridSize: ctx.gridSize, free: preview.free }));
  return doc;
}

/** A scene's tiles as a drag in progress would leave them: groups move and scale what is in them, and span it. */
export function previewTiles(
  tiles: readonly Doc[],
  coll: string,
  preview: Preview | undefined,
  ctx: { mode: EditorMode; gridSize: number },
): Doc[] {
  if (preview?.kind === 'move') {
    const ids = withDescendants(
      tiles,
      preview.keys.map((k) => refOf(k).id),
    );
    const keys = ids.map((id) => keyOf({ coll, id }));
    const moving = { ...preview, keys };
    return withGroupBounds(tiles.map((t) => previewDoc(keyOf({ coll, id: t.id }), t, moving, ctx)));
  }
  const group = preview?.kind === 'handle' ? tiles.find((t) => keyOf({ coll, id: t.id }) === preview.key) : undefined;
  if (preview?.kind === 'handle' && group && isGroup(group)) {
    const shown = { ...group, ...tileBounds(tiles, group.id) };
    const to = applyPatch(
      shown,
      dragHandle(shown, preview.handle, preview.to, { gridSize: ctx.gridSize, free: preview.free }),
    );
    return withGroupBounds(applyTileEdit(tiles, scaleGroupEdit(tiles, group.id, to as unknown as Rect)));
  }
  return withGroupBounds(tiles.map((t) => previewDoc(keyOf({ coll, id: t.id }), t, preview, ctx)));
}
