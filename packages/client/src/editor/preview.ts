import type { Doc } from '@vtt/core';
import { applyPatch, dragHandle, moveBy, snapDelta, type EditorMode } from '@vtt/shared';
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
