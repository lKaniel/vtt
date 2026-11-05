import * as THREE from 'three';
import { at3d, type Standing } from './scene3d.ts';

// Flying in 3D, as BG3 shows a creature off the ground: one whose elevation
// keeps it well above what is under it stays in the air, with its shadow on
// the ground below, a faint line down to it and its height beside it. One at
// or near a surface (a hill, a bridge, a floor) stands on it.

/** Where a creature's feet are (three's y, pixels), and the ground under it when it is in the air. */
export interface Stand {
  feet: number;
  ground?: number;
}

/**
 * Where a creature stands: on the surface under it (`surface`, none off
 * every surface) when its feet are at most `reach` above it, else in the
 * air at its own height `feet`.
 */
export function standAt(feet: number, surface: number | undefined, reach: number): Stand {
  if (surface === undefined) return { feet };
  return feet - surface > reach ? { feet, ground: surface } : { feet: surface };
}

/** A flyer's height over the ground in feet, to the nearest 5. */
export function heightLabel(feet: number, ground: number, px: number): string {
  return `${Math.round((feet - ground) / px / 5) * 5} ft`;
}

interface Mark {
  shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  line: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  label: THREE.Sprite;
  text: string;
}

/** How tall a flyer's height reads on screen: a share of the view's height. */
const LABEL_HEIGHT = 0.032;

let shadowTexture: THREE.Texture | undefined;

/** A soft dark disc (drawn once). */
function shadowPicture(): THREE.Texture {
  if (shadowTexture) return shadowTexture;
  if (typeof document === 'undefined') {
    shadowTexture = new THREE.Texture();
    return shadowTexture;
  }
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  shadowTexture = new THREE.CanvasTexture(c);
  return shadowTexture;
}

function labelPicture(text: string): { texture: THREE.Texture; aspect: number } {
  if (typeof document === 'undefined') return { texture: new THREE.Texture(), aspect: 2 };
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = '600 56px "Alegreya Sans", Georgia, sans-serif';
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + 36;
  c.height = 80;
  g.font = font;
  g.fillStyle = 'rgba(16,14,12,0.72)';
  g.beginPath();
  g.roundRect(0, 0, c.width, c.height, 18);
  g.fill();
  g.fillStyle = '#e8dcc0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, 42);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: c.width / c.height };
}

/** The shadows, drop lines and heights of the creatures in the air. */
export class FlightMarks {
  readonly group = new THREE.Group();
  private marks = new Map<string, Mark>();

  /** Marks exactly the flyers among `all`; `px` is pixels per foot. */
  show(all: readonly Standing[], floor: number, px: number): void {
    const flying = all.filter((s) => s.ground !== undefined);
    const keep = new Set(flying.map((s) => s.id));
    for (const [id, m] of this.marks) if (!keep.has(id)) this.drop(id, m);
    for (const s of flying) this.place(s, floor, px);
  }

  dispose(): void {
    for (const [id, m] of this.marks) this.drop(id, m);
  }

  private place(s: Standing, floor: number, px: number): void {
    const ground = floor + s.ground!;
    const feet = floor + s.height;
    const m = this.marks.get(s.id) ?? this.make(s.id);
    const up = feet - ground;
    m.shadow.position.copy(at3d(s.at, ground + 1));
    m.shadow.scale.setScalar(s.size * 0.45);
    // Higher up, the shadow is fainter.
    m.shadow.material.opacity = Math.max(0.25, 0.75 - up / (60 * px));
    m.line.position.copy(at3d(s.at, ground + up / 2));
    m.line.scale.set(1, Math.max(1, up), 1);
    const text = heightLabel(feet, ground, px);
    if (text !== m.text) this.relabel(m, text);
    m.label.position.copy(at3d(s.at, ground + up * 0.5));
  }

  private make(id: string): Mark {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowPicture(), transparent: true, depthWrite: false }),
    );
    const line = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 1, 6),
      new THREE.MeshBasicMaterial({ color: 0xe8dcc0, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ sizeAttenuation: false, depthTest: false }));
    label.center.set(-0.15, 0.5);
    label.renderOrder = 9;
    const mark = { shadow, line, label, text: '' };
    this.marks.set(id, mark);
    this.group.add(shadow, line, label);
    return mark;
  }

  private relabel(m: Mark, text: string): void {
    m.label.material.map?.dispose();
    const { texture, aspect } = labelPicture(text);
    m.label.material.map = texture;
    m.label.material.needsUpdate = true;
    m.label.scale.set(LABEL_HEIGHT * aspect, LABEL_HEIGHT, 1);
    m.text = text;
  }

  private drop(id: string, m: Mark): void {
    this.group.remove(m.shadow, m.line, m.label);
    m.shadow.geometry.dispose();
    m.shadow.material.dispose();
    m.line.geometry.dispose();
    m.line.material.dispose();
    m.label.material.map?.dispose();
    m.label.material.dispose();
    this.marks.delete(id);
  }
}
