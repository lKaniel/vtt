import type { Point } from '@vtt/shared';
import type { StampDoc } from '../editor/stamp.ts';
import type { ModelShown } from './models3d.ts';

// The stamp brush in the 3D view: the model it holds stands see-through
// where a click would put it (the flat map's ghost, canvas/StampBrush.ts,
// lies under the 3D view and can't be seen there).

/** How see-through the ghost is. */
const GHOST = 0.55;

/** The model to stand for the brush at `pointer`: none, or the one it holds. */
export function stampGhost(
  stamp: { readonly armed: boolean; preview(at: Point, free: boolean): StampDoc | undefined },
  pointer: Point | undefined,
): ModelShown[] {
  const doc = stamp.armed && pointer ? stamp.preview(pointer, false) : undefined;
  if (!doc?.model) return [];
  const rect = { x: doc.x, y: doc.y, w: doc.w, h: doc.h };
  return [{ key: `stamp:${JSON.stringify(doc.model)}`, rect, model: { ...doc.model, opacity: GHOST } }];
}
