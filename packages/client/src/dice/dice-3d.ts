import {
  AmbientLight,
  CanvasTexture,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { dieShape, restingTurn } from './dice-shapes.ts';
import type { ThrownDie } from './dice-throw.ts';

// 3D dice thrown across the screen, like the Dice So Nice module: they tumble
// in from the side and settle with the rolled number on top, in the roller's
// colour, then fade. Loaded only when a roll comes in (three.js is large).

const TUMBLE = 1.3;
const HOLD = 1.6;
const FADE = 0.5;
const CAMERA_Z = 20;

interface Flying {
  mesh: Mesh;
  from: Vector3;
  to: Vector3;
  end: Quaternion;
  axis: Vector3;
  started: number;
}

interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  dice: Flying[];
}

let stage: Stage | undefined;

function makeStage(): Stage {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(devicePixelRatio);
  const canvas = renderer.domElement;
  canvas.dataset.slot = 'dice-3d';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '40' });
  document.body.appendChild(canvas);
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.4));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(4, 6, 12);
  scene.add(sun);
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);
  return { renderer, scene, camera, dice: [] };
}

function fit({ renderer, camera }: Stage): void {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

/** A face's number on the die's colour; 6 and 9 are underlined. */
function faceTexture(label: string, color: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 128);
  g.font = `bold ${label.length > 1 ? 44 : 56}px serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.strokeText(label, 64, 64);
  g.fillStyle = '#fff';
  g.fillText(label, 64, 64);
  if (label === '6' || label === '9') g.fillRect(48, 90, 32, 5);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function dieMesh(die: ThrownDie, color: string): { mesh: Mesh; end: Quaternion } {
  const shape = dieShape(die.sides);
  const materials = die.labels.map(
    (label) => new MeshStandardMaterial({ map: faceTexture(label, color), roughness: 0.45, transparent: true }),
  );
  const mesh = new Mesh(shape.geometry, materials);
  return { mesh, end: restingTurn(shape.normals[die.face]!, (Math.random() - 0.5) * 0.8) };
}

/** Where the dice land: a row (two when many) a little below the middle of the screen. */
function landing(i: number, count: number): Vector3 {
  const perRow = Math.min(count, 6);
  const row = Math.floor(i / perRow);
  const col = i % perRow;
  const inRow = Math.min(perRow, count - row * perRow);
  return new Vector3((col - (inRow - 1) / 2) * 2, -1.5 - row * 2.2, 0);
}

const pickSide = () => (Math.random() < 0.5 ? -1 : 1);

/** Puts one die on the stage, on its way from `side` to its landing spot. */
function launch(on: Stage, die: ThrownDie, color: string, at: { i: number; count: number; side: number }): void {
  const { mesh, end } = dieMesh(die, color);
  const to = landing(at.i, at.count);
  const from = new Vector3(at.side * (9 + Math.random() * 3), to.y + (Math.random() - 0.5) * 4, 2);
  const axis = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  mesh.position.copy(from);
  on.scene.add(mesh);
  on.dice.push({ mesh, from, to, end, axis, started: performance.now() / 1000 + at.i * 0.05 });
}

/** Throws the dice across the screen in `color`. */
export function throwDice(dice: readonly ThrownDie[], color: string): void {
  if (!dice.length) return;
  const on = (stage ??= makeStage());
  const idle = !on.dice.length;
  fit(on);
  const side = pickSide();
  dice.forEach((die, i) => launch(on, die, color, { i, count: dice.length, side }));
  if (idle) requestAnimationFrame(frame);
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Moves a die on; false once it has faded away. */
function fly(d: Flying, now: number): boolean {
  const age = Math.max(0, now - d.started);
  const t = Math.min(1, age / TUMBLE);
  const e = easeOut(t);
  d.mesh.position.lerpVectors(d.from, d.to, e);
  d.mesh.position.z = Math.abs(Math.sin(t * Math.PI * 2.5)) * (1 - t) * 2;
  const spin = new Quaternion().setFromAxisAngle(d.axis, (1 - e) * Math.PI * 5);
  d.mesh.quaternion.copy(spin.multiply(d.end));
  const fading = age - TUMBLE - HOLD;
  const opacity = fading > 0 ? Math.max(0, 1 - fading / FADE) : 1;
  for (const m of d.mesh.material as MeshStandardMaterial[]) m.opacity = opacity;
  return opacity > 0;
}

function dispose(d: Flying): void {
  d.mesh.removeFromParent();
  d.mesh.geometry.dispose();
  for (const m of d.mesh.material as MeshStandardMaterial[]) {
    m.map?.dispose();
    m.dispose();
  }
}

function frame(): void {
  if (!stage) return;
  const now = performance.now() / 1000;
  stage.dice = stage.dice.filter((d) => fly(d, now) || (dispose(d), false));
  stage.renderer.render(stage.scene, stage.camera);
  if (stage.dice.length) {
    requestAnimationFrame(frame);
    return;
  }
  stage.renderer.domElement.remove();
  stage.renderer.dispose();
  stage = undefined;
}
