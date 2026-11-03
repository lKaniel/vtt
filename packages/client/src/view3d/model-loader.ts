import { assetUrl } from '../assets.ts';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// The glTF loader of the 3D view. Model kits (Baileywiki, 3D Canvas's
// compendium) squeeze their meshes with Draco; its decoder is served at
// /draco/ (copied from three by vite.config.ts). WebP textures load as they are.

export const DRACO_PATH = '/draco/';

/** A glTF loader that also decodes Draco meshes. */
export function modelLoader(): GLTFLoader {
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_PATH);
  draco.setDecoderConfig({ type: 'wasm' });
  return new GLTFLoader().setDRACOLoader(draco);
}

/** Loads a model (a game's own from its assets); one that fails says why in the console and loads as nothing. */
export async function loadModel(loader: Pick<GLTFLoader, 'loadAsync'>, src: string): Promise<GLTF | undefined> {
  try {
    return await loader.loadAsync(assetUrl(src));
  } catch (e) {
    console.warn(`Model ${src} did not load: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}
