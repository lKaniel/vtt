import * as THREE from 'three';
import { loadModel, modelLoader } from './model-loader.ts';
import type { ModelInfo } from './model-thumbs.ts';

// Draws a 3D model's picture for the Assets tab (seen from above and to the
// side) and its plan for the flat map (straight down, the model's footprint
// filling the picture), lit like a day scene, on a clear background. One
// small renderer draws them all (model-thumbs.ts asks for one at a time).

const SIDE = 160;
/** From the front right, a little above: the side builders know models from. */
const LOOK_FROM = new THREE.Vector3(1, 0.8, 1.2).normalize();

let renderer: THREE.WebGLRenderer | undefined;
let loader: ReturnType<typeof modelLoader> | undefined;

function setUp(): THREE.WebGLRenderer {
  renderer ??= new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIDE, SIDE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  return renderer;
}

function lit(model: THREE.Object3D): THREE.Scene {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(3, 5, 4);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3a2a, 1.6), sun, model);
  return scene;
}

/** A camera that fits the model's bounding sphere. */
function framing(box: THREE.Box3): THREE.PerspectiveCamera {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1);
  const distance = (sphere.radius || 1) / Math.sin((camera.fov * Math.PI) / 360);
  camera.position.copy(sphere.center).addScaledVector(LOOK_FROM, distance);
  camera.near = distance / 100;
  camera.far = distance * 3;
  camera.lookAt(sphere.center);
  camera.updateProjectionMatrix();
  return camera;
}

function dispose(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mesh = o as THREE.Mesh;
    mesh.geometry.dispose();
    const materials = ([] as THREE.Material[]).concat(mesh.material);
    for (const m of materials) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      m.dispose();
    }
  });
}

/** The model at `src` with its bounds, or undefined if it doesn't load. */
async function measured(src: string) {
  loader ??= modelLoader();
  const gltf = await loadModel(loader, src);
  if (!gltf) return undefined;
  const box = new THREE.Box3().setFromObject(gltf.scene);
  return { gltf, box, size: box.getSize(new THREE.Vector3()) };
}

/** Loads the model at `src` and draws its picture; undefined if it doesn't load. */
export async function renderModel(src: string): Promise<ModelInfo | undefined> {
  const got = await measured(src);
  if (!got) return undefined;
  const { gltf, box, size } = got;
  const r = setUp();
  r.setClearColor(0x000000, 0);
  r.render(lit(gltf.scene), framing(box));
  const thumb = r.domElement.toDataURL('image/webp', 0.85);
  dispose(gltf.scene);
  return { thumb, size: [size.x, size.y, size.z] };
}

/** Pixels along a plan's longer side. */
const PLAN_SIDE = 512;

/** A camera straight above the model, the picture's top the map's north (the model's -z). */
function above(box: THREE.Box3): THREE.OrthographicCamera {
  const size = box.getSize(new THREE.Vector3());
  const middle = box.getCenter(new THREE.Vector3());
  const camera = new THREE.OrthographicCamera(-size.x / 2, size.x / 2, size.z / 2, -size.z / 2, 0.01, size.y + 2);
  camera.up.set(0, 0, -1);
  camera.position.set(middle.x, box.max.y + 1, middle.z);
  camera.lookAt(middle.x, box.min.y, middle.z);
  camera.updateProjectionMatrix();
  return camera;
}

/** Loads the model at `src` and draws it from straight above as a data URL, its footprint filling the picture. */
export async function renderPlan(src: string): Promise<string | undefined> {
  const got = await measured(src);
  if (!got) return undefined;
  const { gltf, box, size } = got;
  if (!size.x || !size.z) return undefined;
  const k = PLAN_SIDE / Math.max(size.x, size.z);
  const r = setUp();
  r.setSize(Math.max(1, Math.round(size.x * k)), Math.max(1, Math.round(size.z * k)), false);
  r.setClearColor(0x000000, 0);
  r.render(lit(gltf.scene), above(box));
  const plan = r.domElement.toDataURL('image/webp', 0.9);
  r.setSize(SIDE, SIDE, false);
  dispose(gltf.scene);
  return plan;
}
