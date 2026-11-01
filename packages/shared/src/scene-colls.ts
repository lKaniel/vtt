// The collections a scene holds, each in scenes/<scene>/<collection>.json,
// and the document type of each. Scene copies, deletes, imports and the
// game files all go by this one list.

export const SCENE_TYPES = {
  tiles: 'tile',
  walls: 'wall',
  lights: 'light',
  tokens: 'token',
  drawings: 'drawing',
  notes: 'note',
  templates: 'template',
  regions: 'region',
  sounds: 'sound',
} as const;

export type SceneCollection = keyof typeof SCENE_TYPES;

export const SCENE_COLLECTIONS = Object.keys(SCENE_TYPES) as SceneCollection[];

/** The scene placeables other than tokens and the streamed map (tiles, walls, lights): sent as documents. */
export const ITEM_COLLECTIONS: readonly SceneCollection[] = ['drawings', 'notes', 'templates', 'regions', 'sounds'];

/** The scene and collection of a "<scene>/<collection>" name, or undefined for any other. */
export function sceneCollOf(coll: string): { scene: string; name: SceneCollection } | undefined {
  const [scene, name, ...rest] = coll.split('/');
  if (!scene || !name || rest.length || !(name in SCENE_TYPES)) return undefined;
  return { scene, name: name as SceneCollection };
}
