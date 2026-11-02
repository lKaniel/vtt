import type { Rectangle } from 'pixi.js';
import type { CameraMotion } from './camera-motion.ts';

const WHEEL_ZOOM_SPEED = 0.0015;

/**
 * The wheel zooms the map around the pointer, and a middle press pans
 * (MapView) instead of starting the browser's auto-scroll. Returns the
 * function that stops listening.
 */
export function listenToWheel(
  canvas: HTMLCanvasElement,
  cam: CameraMotion,
  screen: Rectangle,
  moved: () => void,
): () => void {
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    cam.zoomAt(
      cam.zoomGoal * Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED),
      [e.clientX - rect.left, e.clientY - rect.top],
      screen,
    );
    moved();
  };
  const press = (e: MouseEvent) => {
    if (e.button === 1) e.preventDefault();
  };
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('mousedown', press);
  return () => {
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener('mousedown', press);
  };
}
