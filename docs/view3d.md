# The 3D view

The top bar's cube button (or **V**) stands the map up in 3D, with a camera
like Baldur's Gate 3's. It is each player's own choice, kept in their
browser (`session.view3d`); the game files don't change.

## The camera

| Control                | Does                                                                        |
| ---------------------- | --------------------------------------------------------------------------- |
| Wheel                  | Zooms; close in the camera drops behind the shoulder, far out it tilts down |
| Middle drag, `,` / `.` | Turns the camera round what it looks at                                     |
| Right drag             | Moves the camera over the ground (a right click still opens the menu)       |
| `O`                    | Tactical view: straight down, as BG3's                                      |
| `Home`                 | Back to your creature                                                       |

The camera follows the creature you act with until you move it yourself.
Walls between the camera and that creature are cut low, so the room stays
in view; the tactical view shows them whole. The keys are in the Keys
dialog under Camera.

## How it works

`client/src/view3d/`:

- `orbit.ts`: the camera as pure maths (target, yaw, distance; pitch eased
  by distance) and the square of ground it sees.
- `pixi-bridge.ts`: the 2D map (`MapView`) keeps drawing ground, light and
  fog, into a hidden 2048² canvas pointed at that square, and keeps taking
  every pointer event: Pixi's events are moved to the 3D surface and each
  pointer is mapped to the map point under it. So clicking, hovering, the
  walk preview, targeting and menus work in 3D as they do flat.
- `walls3d.ts`: walls as boxes, from the shown floor up to its ceiling
  (`top`, or the wall's own height), and the cutaway.
- `scene3d.ts`: three.js meshes: the ground picture, instanced walls,
  creatures as standing pictures.
- `View3D.ts` ties them together; `view3d-switch.ts` turns it on and off
  with the session switch.

## Models

Image tiles with a `model` stand glTF models (`.glb`, or `.gltf` with its
files), stretched over the tile or repeated across it; creatures with a
`model` stand as that figure instead of their picture. A scene's `view3d`
gives it a sky, a ground colour and can turn the standing walls off. See
`model` and "The 3D view" in `game-format.md`. Players see models only
where they have explored. Draco-compressed meshes and WebP textures load
too: the client serves three's Draco decoder at `/draco/` (`model-loader.ts`,
copied by `vite.config.ts`), and a model that fails says why in the console.
`models3d.ts` loads each file once and clones it;
`model3d.ts` in shared works out where each copy goes. Tiles bigger than
a chunk stream in the scene-wide chunk (`WIDE_CHUNK` in shared
`chunks.ts`), which every view loads, so a whole map's terrain shows
wherever the camera is. Tiles with a
`solid` raise a drawn outline as a solid (`solids3d.ts`, placed by
`solid3d.ts` in shared). Tiles with `terrain` raise ground from a
heightmap (`terrain3d.ts`, as 3D Canvas builds it: a box whose vertices
above its bottom the picture's red lifts, stretched so its peak stands
`height` up, painted by `terrain-paint.ts` with up to four pictures by
height or slope); the camera looks at the terrain under it, and clicks land
on it. A scene `view3d.ground` of `none` draws no ground beyond the map.

The Foundry importer brings 3D Canvas (levels-3d-preview) along: model
tiles with their depth, elevation, rotation, tilt, fill and tint (merged
tiles split into their copies; `center: false` / `ground: false` keep a
model's own origin on its spot, as 3D Canvas does without autoCenter and
autoGround); drawn
polygons as solids; heightmap boxes as terrain; tokens'
figures; a scene's sky, table colour and whether its walls show.

The floor shown is the scene level shown on the 2D map (see "Scene levels"
in `game-format.md`): its walls stand, and creatures stand at their height
above it.
