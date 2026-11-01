import type { Point } from '@vtt/shared';
import { DRAG_TYPE, type DragPayload } from '../drops.ts';
import type { Session } from '../session.ts';

/** The GM drags actors, monsters, items and spells in from the side panel onto the map. */
export function listenToDrops(
  canvas: HTMLCanvasElement,
  session: Session,
  toMap: (x: number, y: number) => Point,
): void {
  canvas.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  canvas.addEventListener('drop', (e) => {
    const data = e.dataTransfer?.getData(DRAG_TYPE);
    if (!data) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    session.drop(JSON.parse(data) as DragPayload, toMap(e.clientX - rect.left, e.clientY - rect.top));
  });
}
