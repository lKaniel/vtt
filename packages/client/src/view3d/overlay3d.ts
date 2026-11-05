import type { Point, Rect } from '@vtt/shared';
import * as THREE from 'three';
import type { PathPreview } from '../canvas/PathPreview.ts';
import { type HeightAt, Marks3D, type Spot } from './marks3d.ts';
import type { Picker } from './pick3d.ts';

// The 3D view's marks for the pointer (marks3d.ts) at work: the ring under
// the pointer, the preview the flat map drew laid over the surfaces, its
// label beside where it ends, and a marker where a walk was sent until the
// creature gets there. View3D.ts calls `frame` once a frame.

/** What the overlay needs of the 3D view. */
export interface OverlayHost {
  surface: HTMLElement;
  camera: THREE.Camera;
  picker: Picker;
  preview: Pick<PathPreview, 'container' | 'line' | 'shown'>;
  grid(): number;
  /** The height of what a walker stands on at a map point. */
  heightAt: HeightAt;
  /** The creature you act with, where it stands. */
  walker(): Point | undefined;
  /** The marquee being dragged. */
  marquee(): Rect | undefined;
}

/** A press that moves less than this is a click, pixels. */
const CLICK_PIXELS = 5;
/** A surface whose way up leans less than this (its normal's y) is a wall to the ring. */
const STEEP = 0.6;

export class Overlay3D {
  readonly marks = new Marks3D();
  private label = document.createElement('div');
  private pointer?: { x: number; y: number };
  private looked = '';
  private press?: { x: number; y: number; walk?: Point };
  private off: (() => void)[] = [];

  constructor(private readonly host: OverlayHost) {
    this.label.className =
      'pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-pre text-center font-semibold [text-shadow:0_0_3px_#000,0_0_3px_#000]';
    this.label.dataset.testid = 'walk-label';
  }

  start(): void {
    const s = this.host.surface;
    s.appendChild(this.label);
    // The flat map's preview lies on the street; the 3D view draws it over the surfaces instead.
    this.host.preview.container.visible = false;
    this.listen(s, 'pointermove', (e) => (this.pointer = { x: e.clientX, y: e.clientY }));
    this.listen(s, 'pointerleave', () => (this.pointer = undefined));
    this.listen(s, 'pointerdown', (e) => this.down(e));
    this.listen(window, 'pointerup', (e) => this.up(e));
  }

  private listen(on: EventTarget, type: string, fn: (e: PointerEvent) => void): void {
    const handler = (e: Event) => fn(e as PointerEvent);
    on.addEventListener(type, handler);
    this.off.push(() => on.removeEventListener(type, handler));
  }

  /** A left press: notes the walk the preview shows, which a click sends. */
  private down(e: PointerEvent): void {
    if (e.button !== 0) return;
    const shown = this.host.preview.shown;
    this.press = { x: e.clientX, y: e.clientY, ...(shown?.kind === 'walk' && { walk: shown.end }) };
  }

  private up(e: PointerEvent): void {
    const p = this.press;
    this.press = undefined;
    if (!p?.walk || e.button !== 0 || Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_PIXELS) return;
    const [x, y] = p.walk;
    this.marks.goingTo(new THREE.Vector3(x, this.host.heightAt(x, y), y), this.host.grid());
  }

  /** Once a frame: the cursor, the preview, its label and the walk's marker. */
  frame(dt: number, frame: number): void {
    const h = this.host;
    this.cursor(frame);
    this.marks.preview(h.preview.line, { grid: h.grid(), heightAt: h.heightAt });
    this.marks.marquee(h.marquee(), { grid: h.grid(), heightAt: h.heightAt });
    this.marks.tick(dt, h.walker());
    this.placeLabel();
  }

  /** The ring under the pointer, looked for again when the pointer or the camera moved. */
  private cursor(frame: number): void {
    const p = this.pointer;
    const eye = this.host.camera.position;
    const key = p ? `${p.x},${p.y},${eye.x.toFixed(0)},${eye.y.toFixed(0)},${eye.z.toFixed(0)}` : '';
    if (key === this.looked) return;
    this.looked = key;
    const picked = p && !this.host.picker.held ? this.host.picker.pick(p.x, p.y, frame) : undefined;
    this.marks.cursor(picked && !picked.creature ? this.flat(picked) : undefined, this.host.grid());
  }

  /** On a wall or a steep slope, the ring lies on the ground at its foot. */
  private flat(spot: Spot): Spot {
    if (spot.normal.y >= STEEP) return spot;
    const { x, z } = spot.point;
    return { point: new THREE.Vector3(x, this.host.heightAt(x, z), z), normal: new THREE.Vector3(0, 1, 0) };
  }

  /** The preview's words over where it ends, as the flat map has them. */
  private placeLabel(): void {
    const shown = this.host.preview.shown;
    const text = shown ? [shown.label, shown.notes].filter(Boolean).join('\n') : '';
    this.label.hidden = !text;
    if (!shown || !text) return;
    const [x, y] = shown.end;
    const at = new THREE.Vector3(x, this.host.heightAt(x, y) + this.host.grid() * 0.6, y).project(this.host.camera);
    const { clientWidth: w, clientHeight: hgt } = this.host.surface;
    this.label.textContent = text;
    this.label.style.color = `#${shown.color.toString(16).padStart(6, '0')}`;
    this.label.style.left = `${((at.x + 1) / 2) * w}px`;
    this.label.style.top = `${((1 - at.y) / 2) * hgt}px`;
    this.label.hidden = at.z > 1;
  }

  destroy(): void {
    for (const off of this.off) off();
    this.host.preview.container.visible = true;
    this.label.remove();
    this.marks.dispose();
  }
}
