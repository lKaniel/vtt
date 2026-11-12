// 3D models for the specs that stand them in the 3D view.

/** A one-triangle glTF model, its buffer inside it. */
export const TRIANGLE = {
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  buffers: [
    { byteLength: 36, uri: 'data:application/octet-stream;base64,AAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgD8AAAAA' },
  ],
  bufferViews: [{ buffer: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
};

/** A one-triangle model with depth: 2 units across, 1 up and 3 deep (10 by 5 by 15 ft at 5 ft a unit). */
export const WEDGE = {
  ...TRIANGLE,
  buffers: [
    { byteLength: 36, uri: 'data:application/octet-stream;base64,AAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAgD8AAEBA' },
  ],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [2, 1, 3] }],
};
