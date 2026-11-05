# The 3D view

A 3D scene (scene.json `"view": "3d"`, set in the scene's settings) shows
in 3D, with a camera like Baldur's Gate 3's, for everyone on it; a flat
scene never does (`session.view3d`). The GM alone can lay a 3D scene flat
for a while to edit it on the 2D map: the top bar's map button (or **V**),
and the cube button stands it up again.

## The camera

| Control         | Does                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| Wheel           | Zooms; close in the camera drops behind the shoulder, far out it tilts down |
| Middle drag     | Sideways turns the camera round your creature, up and down tilts it         |
| `,` / `.`       | Turns the camera                                                            |
| `W` `A` `S` `D` | Moves the camera (the flat map's W and D tools stay on the flat map)        |
| Right drag      | Moves the camera over the ground (a right click still opens the menu)       |
| `O`             | Tactical view: straight down, as BG3's                                      |
| `Home`          | Back to your creature                                                       |

The camera keeps with the creature you act with and turns round its feet.
Moved away (W A S D, a right drag), it stays until that creature moves,
you pick another or press Home, then glides back (`camera3d.ts`).
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
- `peek3d.ts`: seeing your creature, as in BG3. Whatever stands between
  the creature you act with and the camera (a tube from its chest to the
  eye, wider the farther out the camera is) is not drawn, above its knees:
  a roof, the floor above, a house in front. Everything else stays whole, so
  the floors above and below show. While it is inside a building
  (`inside3d.ts`), that building's side towards the camera is cut down to
  its knees too, so the room shows. Clicks go through what is cut.
- `surface3d.ts`: what creatures stand on (terrain, model floors, boxes).
  The flat map's drawing (paths, rings, spell areas) is draped over
  terrain (`drapeOver` in `terrain-paint.ts`).
- `marks3d.ts`, `overlay3d.ts`: what the pointer and the previews show, as
  in BG3, drawn over the surfaces (over everything, so a path behind a wall
  still shows): a ring on the surface under the pointer (at a wall's foot
  on a wall), the walk's path laid over what it crosses step by step (it
  climbs stairs, not tables), its end ring and length (an HTML label), the
  attack and spell lines and areas, the marquee being dragged, and a marker
  where a walk was sent until the creature gets there. The flat map's
  previews draw with a `Sketch` (`canvas/sketch.ts`) that keeps its shapes
  for this; under 3D the flat map's own preview is hidden.
- `light3d.ts`: the sky light and sun (dimmed by darkness), the sky picture
  as the environment, the ground beyond the map under the lowest floor, and
  the haze.
- `scene3d.ts`: three.js meshes: the ground picture, instanced walls,
  creatures as standing pictures.
- `frame-budget.ts` and `ground-feed.ts`: what a frame saves. The 2D map
  draws the ground only when the camera leaves the square it drew last (it
  draws a quarter more than it needs), when the pointer moves or a creature
  walks, and a few times a second for what flickers. The 3D view draws only
  when something changed, and a few times a second while nothing does. The
  3D picture drops resolution while frames are slow (over 24 ms) and climbs
  back once they are quick. Models that would look tiny are left out (never
  creatures' figures).
- `instances3d.ts`: copies of one model on tiles are drawn together, one
  instanced mesh per piece of the model in each 20-square part of the map.
  Each copy keeps its own meshes for clicks, what creatures stand on and the
  look inside, with unseen stand-in materials. Figures, see-through models,
  rigged models and `animated` ones (doors) are drawn on their own; a tile
  lit gold under the pointer is drawn on its own while it glows.
- `quality3d.ts`: the Graphics setting (Settings, 3D graphics: Auto, Low,
  Medium, High), per browser. Auto picks from the graphics card the browser
  reports. It sets the resolution, smoothing, the ground picture's size, how
  small far things may be, the most scene lights on models, the largest
  model texture (Low 512 px, Medium 1024 px; textures shrink when a model
  file loads) and how often a still view is drawn. A new choice starts the
  3D view again.
- `View3D.ts` ties them together; `view3d-switch.ts` turns it on and off
  with the session switch.

Under the 3D view the flat map paints only what lies on the ground: not
the tiles that stand in 3D (models, solids, terrain), nor the background
picture when the scene's `view3d.background` is `false`
(`paintedUnder3d` in `content3d.ts`). Where it paints nothing the ground is
see-through, so the 3D floor, the table colour or the sky shows there.

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

The Foundry importer brings 3D Canvas (levels-3d-preview) along: a scene
3D Canvas opens in 3D ("Auto 3D") becomes a 3D scene, one that hides its
2D background in 3D keeps it off the 3D floor; model
tiles with their depth, elevation, rotation, tilt, fill and tint (merged
tiles split into their copies; `center: false` / `ground: false` keep a
model's own origin on its spot, as 3D Canvas does without autoCenter and
autoGround); drawn
polygons as solids; heightmap boxes as terrain; tokens'
figures; a scene's sky, table colour and whether its walls show.

The floor shown is the scene level shown on the 2D map (see "Scene levels"
in `game-format.md`): its walls stand, and creatures stand at their height
above it.
