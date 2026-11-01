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

/** A token let go on the map: dragged to `at`, it walks there with the rest of the selection; a click selects it alone. */
export function dropToken(s: Session, id: string, at: Point | undefined): void {
  if (!at) return s.select(id);
  const from = s.tokens.get(id);
  if (!from) return;
  const [dx, dy] = [at[0] - from.x, at[1] - from.y];
  for (const t of s.tokens.values())
    if (t.id !== id && s.isSelected(t.id) && s.canControl(t)) s.move(t.id, [t.x + dx, t.y + dy]);
  s.move(id, at);
}
