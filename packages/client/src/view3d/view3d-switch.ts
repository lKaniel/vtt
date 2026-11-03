import type { MapView } from '../canvas/MapView.ts';
import type { Session } from '../session/session.ts';
import { View3D } from './View3D.ts';

/** Shows the map in 3D while `session.view3d` is on (from now on); returns the cleanup. */
export function followView3d(session: Session, map: MapView, host: HTMLElement): () => void {
  let view: View3D | undefined;
  const sync = () => {
    if (session.view3d.on === !!view) return;
    if (view) {
      view.destroy();
      view = undefined;
    } else {
      view = new View3D(map, host, session);
      view.start();
    }
  };
  const off = session.on('change', sync);
  sync();
  return () => {
    off();
    view?.destroy();
  };
}
