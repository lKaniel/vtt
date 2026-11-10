# Game format

A game is a folder of JSON files. The server loads it on start, watches it,
and writes game changes (token moves, doors) back to it. Editing a file by
hand or with Claude updates every connected client live.

```
world/                      the example game (another folder: VTT_GAME); lobby games are data/games/<id>/
  game.json                 the game: name, system, rules, active scene, players, format
  scenes/<scene>/           one folder per scene; a game has as many as you like
    scene.json              name, grid, camera start, time of day, fog of war
    tiles.json              the scene's tiles, as one list
    walls.json              walls, doors and windows
    lights.json             placed lights
    tokens.json             tokens on the scene: where each actor stands
    drawings.json           shapes, lines, freehand and text drawn on the map
    notes.json              map pins that open journal entries
    templates.json          measured areas: spell circles, cones, lines and squares
    regions.json            areas that do something when a token walks in
    sounds.json             ambient sounds
    fog/<player>.json       explored fog of war, kept by the server (don't edit)
  actors/<id>.json          creatures' sheets: the Actors list
  journals/<id>.json        journal entries: handouts and the GM's notes
  tables/<id>.json          roll tables
  playlists/<id>.json       music
  macros/<id>.json          chat and script macros for the hotbar
  cards/<id>.json           card decks, hands and piles
  folders/<id>.json         the folders of the sidebar lists
  combat.json               the fight in progress, if any
  time.json                 the game clock and its calendar (made on first start)
  assets/                   images referenced by tiles and tokens (uploads in assets/uploads/)
```

Run `pnpm check-game` after editing. It reports every problem with the file
and the item it's in. The schemas live in `packages/shared/src/schema.ts`
(tiles, walls, lights), `packages/shared/src/game-schema.ts` (game and
scene) and, for D&D creatures, `packages/system-dnd5e/src/token-schema.ts`
(tokens and actors).

Every id is lowercase letters, digits and dashes, and unique within its list:
two walls of a scene can't share an id, but a wall and a light can.

## Coordinates

Everything is in **pixels** on one unbounded plane per scene. `x` grows
right, `y` grows down, negative values are fine.

- `gridSize` pixels make 5 ft (default 100), with or without a grid.
- Scenes have no grid unless `grid` is `"square"`, `"hex-rows"` or
  `"hex-cols"`. Without one, tokens walk
  to any point, around walls and around other creatures (no one walks
  through or stops inside another), and distances are plain feet as the
  crow flies. Creatures within half a square of each other's edge count as
  5 ft apart, so melee works without lining tokens up.
- With `"grid": "square"` the square at column `c`, row `r` spans
  `c*gridSize` to `(c+1)*gridSize`, its centre is `(c + 0.5) * gridSize`,
  and tokens walk square centre to square centre (with `gridSize: 100` a
  token sits at `x: 550`, not `x: 500`), every square 5 ft, diagonals too.
- With `"grid": "hex-rows"` (pointy tops, rows) or `"hex-cols"` (flat tops,
  columns) tokens walk hex centre to hex centre, every hex 5 ft, and reach
  and range count hexes. `gridSize` is the distance between two
  neighbouring hexes' centres. In rows, hex `[q, r]` (row `r`, each row
  half a hex right of the one above) has its centre at
  `x = gridSize * (q + r / 2 + 0.5)`, `y = gridSize * (0.866 * r + 0.577)`,
  so hex `[0, 0]` fits in the map's top left corner; columns are the same
  with x and y swapped. `grid.ts` in shared has the maths (`latticeOf`).
- Walls usually run along square edges, so their ends are multiples of
  `gridSize`; the editor snaps to them even when no grid is drawn.

## game.json

```json
{
  "id": "example",
  "name": "The crossroads",
  "rules": "2014",
  "system": "dnd5e",
  "scene": "crossroads",
  "players": [
    { "id": "gm", "name": "GM", "role": "gm", "color": "#e0b040" },
    { "id": "player1", "name": "Player 1", "role": "player", "color": "#5a9be0" }
  ]
}
```

`scene` is the folder in `scenes/` the game is on: where everyone plays unless
a seat says otherwise. A seat's own `"scene"` puts that seat on another scene:
the GM looking at a scene to prepare it, or a player the GM sent elsewhere (a
split party). The GM's Scenes tab writes both ("Play here" sets `scene` and
clears every seat's own). At least one player must have `"role": "gm"`.
`system` is the rulebook the game runs on; `"dnd5e"` (the default) is the only
one so far. `packs` lists the installed asset packs the game uses (see
[packs.md](packs.md)); tiles and tokens refer to their files as
`pack://<pack>/<path>`, and tokens can use their monsters.
`plugins` lists the installed plugins every client at the game loads (see
[plugins.md](plugins.md)).
Changes reach everyone live: whoever's seat, scene or settings changed starts
over on their scene; a seat that's gone is disconnected.

`players` are the game's players: you join a game by picking one on its join
screen (see `docs/lobby.md`), with its password if the GM gave it one (kept by
the server, not here). Add one here, or on the game's page.
A seat's `settings` are the player's own options, set from the gear in the
top bar: `opportunity` (`ask`, `auto`, `never`: how opportunity attacks are
offered) and `hitReactions` (`ask`, `never`: shield and uncanny dodge). A
creature reacts by the settings of a player who controls it, else the GM's.
Removing a seat deletes its explored fog. A player's character brought onto the map becomes an actor
and a linked token, both with the character's id and the player as
`owner` in `ownership`; saving or levelling the character updates its name, stats and
senses.
A seat's `"character"` names the actor that player plays (Foundry's user
character; the Foundry import fills it in, the GM picks it in the Players
tab, which also makes the actor theirs). Without one it is the character
(stats, no stat block) only they own, else one they share. That character's
token is selected for them when they arrive on a scene, and heads their
Actors tab, where they place it on the map if it isn't there (a player may
place a creature they own: shown, a linked one once per scene).
How big a token is and what it sees (`size`, `light`, senses, `filter`,
`model`) and what creature it is (`monster`, `pile`) are the GM's to change
(a `trusted` seat changes the first group on what it owns too);
a player who owns it edits the rest of their sheet (its picture and look too,
uploading a picture of their own), and levels up from its Level up button.

`format` is the folder's format; the server sets it when it moves an older
folder up (see the end of this page). Leave it as it is.

Roles, like Foundry's user roles (the GM changes them in the Players tab):

| Role       | What the seat may do                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gm`       | Everything.                                                                                                                                                   |
| `trusted`  | A player who also changes their creature's size, senses, light and elevation, and overrides its turns (action, bonus action, reaction, movement, initiative). |
| `player`   | Play the tokens they own, and edit their sheets (not ownership, position or `hidden`).                                                                        |
| `observer` | Watch through the party's eyes and read their sheets; act on nothing.                                                                                         |

## scene.json

```json
{ "name": "Crossroads", "gridSize": 100, "start": [1000, 900], "darkness": 0.85 }
```

`start` is where the camera opens, and where characters brought in by
their players appear. `darkness` (0 to 1, default 0) is the time of day: up to 0.3
is daylight, up to 0.6 is dim light (dusk, moonlight) and above that is
darkness, where only lights and senses like darkvision show anything.
Indoors (ground under a roof, an overhead tile or the floor above, that
walls close in on every side) the sky's light never reaches: it is dark
there at any hour, lit only by lamps and seen with darkvision. A missing
wall, an open door or a window (a wall that lets light through) lets the
daylight in, two squares deep: the far end of a long hall stays dark. On a
scene whose darkness follows the clock, dawn and dusk tint the light orange.
`vision` (default `true`) is fog of war: players see only what their tokens
can. The GM can check what a creature sees with "See through its eyes" in
its right-click menu (light, sight and fog as its players get them). `chunkSize` (default 2000, a multiple of `gridSize`) is how big the
pieces are that the server streams to each camera; it has nothing to do with
how the scene is stored.

Optional, all set from the Scenes tab too:

| Field                  | What it does                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `name`                 | What the Scenes list and the top bar show (the folder name otherwise).                                                       |
| `sort`                 | Order in the Scenes list (a sort key, see `sort-key.ts`); the editor writes it.                                              |
| `exploration`          | With fog of war, players keep seeing (dimmed) where they have been. Default on.                                              |
| `grid`                 | `"none"` (default): no grid, free movement in feet. `"square"`: grid lines, square moves. `"hex-rows"`, `"hex-cols"`: hexes. |
| `gridColor`            | Grid line colour, default `"#000000"`.                                                                                       |
| `gridOpacity`          | 0 to 1, default 0.16.                                                                                                        |
| `background`           | What shows where nothing is drawn, e.g. `"#1b1d22"`.                                                                         |
| `darknessFollowsClock` | The darkness follows the game clock's time of day (see time.json); `darkness` is ignored. New scenes start with it on.       |
| `wallArt`              | `true`: walls are drawn as stone and doors swing (a map made of plain tiles). Missing: walls are invisible and only block.   |
| `levels`               | Floors of the scene, see "Scene levels" below.                                                                               |
| `playlist`             | A playlist id: it starts (and the one playing stops) when the game moves here.                                               |
| `navigation`           | `true`: the scene is in the GM's navigation bar under the top bar.                                                           |
| `navName`              | Its name in that bar (default `name`).                                                                                       |
| `thumb`                | A small picture for the bar and the Scenes list (default the background tile's picture).                                     |

The navigation bar always holds the game's scene and the one the GM is on;
a click looks at a scene, its play button moves the game there. A
foreground picture (Foundry's scene foreground) is an image tile drawn over
everything: `"overhead": true, "occludedAlpha": 1` makes it a roof that
never fades.

Every scene is live at once: the rules (moves, doors, fights, spells) work
on whichever scene the player acting is on.

### Weather

`weather` lays rain, snow, cloud shadows, fog, embers or birds over the map,
like FXMaster: a list of layers, each `{ "kind", "density" (0-1, default
0.5), "wind" (-1 to 1, sideways), "tint" }`. A storm is rain under dark
clouds:

```json
"weather": [
  { "kind": "rain", "density": 0.9, "wind": 0.4 },
  { "kind": "clouds", "density": 0.7, "tint": "#5a606c" }
]
```

The GM adds layers from presets (rain, snow, clouds, fog, embers, birds,
storm, blizzard, wildfire) in the scene's settings. Players who turned
animations down see it half as thick, or not at all.

With `weatherCycle` the weather changes with world time instead (and
`weather` is ignored): every `every` hours (default 4) one of `options` comes
up, `weight` making it likelier (default 1, 0 never), `months` (indexes into
the calendar's months) keeping it to part of the year. `"clear"` is no
weather; the others are the preset ids. It is worked out from the clock, so
skipping time, or undoing it, changes it too:

```json
"weatherCycle": {
  "every": 6,
  "options": [
    { "weather": "clear", "weight": 3 },
    { "weather": "rain" },
    { "weather": "storm", "weight": 0.5 },
    { "weather": "snow", "months": [0, 1, 11] }
  ]
}
```

### The 3D view

A scene is a flat map or a 3D scene, and says which: `"view": "3d"` makes
it a 3D scene, which everyone sees in the 3D view (docs/view3d.md) as soon
as they are on it; missing or `"2d"` is a flat map, which never shows in 3D.
The GM can lay a 3D scene flat for a while to edit it (the top bar's map
button, or V). Set it in the scene's settings.

`"view3d": { "sky": "/assets/sky/day.webp", "ground": "#341f0f", "walls": false, "background": false }`
sets how a 3D scene looks: `sky` is a panorama picture all round
(equirectangular), `ground` the colour beyond the map, `"walls": false`
leaves the walls lying flat when the scene's models are its walls, and
`"background": false` keeps the background tile's picture off the 3D floor
when the scene's models and terrain are the floor, and `"fog": { "color":
"#d9d0b4", "distance": 8000 }` hazes everything from 10 squares out until
`distance` pixels hide it, the fog's colour all round instead of the sky.
The sky's picture also lights the scene. All optional.

### Explored fog of war

With `vision` and `exploration` on, the server works out what each player's
tokens have seen and keeps it per player per scene in
`scenes/<scene>/fog/<player>.json` (cells a quarter of a square wide, in
blocks; see `shared/src/fog.ts`). It follows the player to another device.
The GM's fog tools (Reveal and Hide brushes, Reset) change it, and Ctrl+Z
undoes them. Delete the file to make a player forget a scene; changing
`gridSize` starts the fog over. `check-game` ignores the `fog/` folder.

## Tiles and walls

`tiles.json` and `walls.json` are plain lists. Coordinates are absolute scene
pixels.

`tiles.json`:

```json
[
  { "kind": "rect", "id": "grass", "x": 0, "y": 0, "w": 2000, "h": 2000, "color": "#4f6b3a", "background": true },
  { "kind": "image", "id": "tavern", "x": 400, "y": 200, "w": 800, "h": 600, "src": "maps/tavern.webp" },
  { "kind": "rect", "id": "rug", "parent": "tavern", "x": 500, "y": 300, "w": 200, "h": 100, "color": "#8a3030" },
  { "kind": "group", "id": "camp", "name": "Goblin camp", "sort": "V" },
  { "kind": "image", "id": "tent", "parent": "camp", "x": 1500, "y": 300, "w": 200, "h": 200, "src": "tent.webp" }
]
```

`walls.json`:

```json
[
  { "id": "tavern-n", "a": [400, 200], "b": [1200, 200] },
  { "id": "tavern-door", "a": [700, 800], "b": [800, 800], "door": "closed" }
]
```

- Tiles nest like Figma layers. `parent` names the tile a tile sits in: a
  `group` (no picture of its own, it spans what is in it) or any other tile
  (a container: a house holding its furniture). Moving, copying or deleting a
  tile takes what is in it along; a group left empty is deleted. Coordinates
  stay absolute inside parents.
- Tiles draw parent first, then what is in it. Among tiles with the same
  parent, `sort` keys (see `sort-key.ts`) set the order, later on top; tiles
  without one draw first, in file order. The editor writes the keys.
- `"background": true` marks ground: tiles drawn on it don't go inside it, and
  a drag that starts on it draws a selection box. `"locked": true` lets clicks
  and boxes pass through a tile (and what is in it); select it in the layers
  panel. `name` is what the layers panel shows (the id otherwise).
- `check-game` reports a `parent` that isn't a tile of the scene, ground
  holding tiles, loops, and (as a warning) empty groups.
- A `rect` tile can have painted ground: `"texture"` is one of `grass`, `dirt`,
  `sand`, `stone`, `cobble`, `wood`, `water`, `rock`, tinted by `color` (pick
  the lightest shade you want). `textureScale` is how many squares one repeat
  covers (default 2). Grass, dirt, sand, water and rock get natural wobbly
  edges; set `"edge": "straight"` or `"rough"` to choose. `image` tiles load from
  `assets/`.
- `"hidden": true` keeps a tile from players (the GM sees it faintly) until a
  trigger shows it.
- A tile with a `trigger` runs actions, like Monk's Active Tiles:
  `{ "on": "click", "actions": [ … ], "once": true, "gmOnly": true, "disabled": true }`.
  `on` is `"click"` (the default: a player clicks it in the tokens mode, with
  the creature they have selected) or `"enter"` (a creature walks onto it; a
  hidden plate still works). `once` turns it off after it runs, `gmOnly` lets
  only the GM click it. `"near": 150` lets only a creature within that many
  pixels of the tile use it (0: standing on it; the one clicked with, else
  the player's nearest; the GM's click needs none). Players are told only
  that a tile can be clicked. The actions, in order (regions take them as
  behaviours too):

  | Action                                                                                                                | What it does                                                                                                                                                                  |
  | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `{ "type": "image", "images": ["/assets/up.png", "/assets/down.png"] }`                                               | Shows the next picture, round and round; `tile` names another tile.                                                                                                           |
  | `{ "type": "visibility", "target": { "coll": "tiles", "id": "chest" }, "to": "show" }`                                | Shows, hides or toggles a tile, token, region, drawing, note, sound or light (a hidden light is out).                                                                         |
  | `{ "type": "sound", "src": "/assets/clunk.ogg", "volume": 0.8 }`                                                      | Plays once for everyone on the scene.                                                                                                                                         |
  | `{ "type": "teleport", "to": [x, y], "scene": "cellar", "level": "loft" }`                                            | Moves the creature that set it off (the actions after it wait), onto `level` when named.                                                                                      |
  | `{ "type": "door", "wall": "gate", "to": "toggle" }`                                                                  | Opens, closes, locks or toggles a door.                                                                                                                                       |
  | `{ "type": "message", "text": "…", "gmOnly": true }`                                                                  | Says it in chat.                                                                                                                                                              |
  | `{ "type": "journal", "entry": "letter", "page": "p1" }`                                                              | Shares the entry with the players and opens it on their screens.                                                                                                              |
  | `{ "type": "activate", "target": { "coll": "tiles", "id": "trap" }, "to": "off" }`                                    | Turns another tile's trigger (or a region) `on`, `off` or `toggle`.                                                                                                           |
  | `{ "type": "elevation", "target": { "coll": "tiles", "id": "lift" }, "by": 20 }`                                      | Raises or lowers a tile (its model) or a creature `by` feet, or `to` a height; no `target`: the creature that set it off. Creatures standing on a tile ride with it (a lift). |
  | `{ "type": "shift", "target": { "coll": "tiles", "id": "cell-door" }, "by": [0, 130] }`                               | Slides a tile or a creature that many pixels (a sliding door).                                                                                                                |
  | `{ "type": "rotate", "target": { "coll": "tiles", "id": "wheel" }, "by": 90 }`                                        | Turns a tile, or a light's beam (`"coll": "lights"`), `by` degrees clockwise, or `to` an angle.                                                                               |
  | `{ "type": "view", "scene": "cellar", "everyone": true }`                                                             | Shows another scene to the player who set it off (and the players of its creature), or to everyone; no creature moves.                                                        |
  | `{ "type": "choice", "title": "The well", "text": "Climb down?", "options": [{ "label": "Yes", "actions": [ … ] }] }` | Asks the player who set it off (or the players of its creature) to pick a button; that button's actions run (any action but a choice). The actions after it don't run.        |

  The GM edits a trigger (or a region's behaviours) with the inspector's
  **Add trigger…** button.

- An `image` tile's `src` may be an animated GIF or a video (`.webm`, `.mp4`,
  `.m4v`, `.ogv`), which loops without sound. `"scroll": { "x": 20, "y": 0 }`
  slides the picture inside the tile, in pixels a second (running water,
  drifting clouds).
- `"overhead": true` makes an image tile a roof or a canopy: it draws over
  the creatures, and goes see-through while one of yours stands under it (the
  GM's: the selected token). `occludedAlpha` is how opaque it stays then, 0
  (gone, the default) to 1. The Foundry importer makes roofs of overhead,
  roof and Better Roofs tiles.
- `"tint": "#88aaff"` colours an image tile's picture (moonlight, a sickly
  swamp), and `"shadow": {}` gives it a soft drop shadow (trees, roofs,
  floating rocks), optionally `{ "offset": 12, "blur": 8, "alpha": 0.5 }`.
- `"rotation": 90` turns an image tile's picture clockwise about the tile's
  centre (degrees), `"flipX": true` / `"flipY": true` mirror it, and
  `"alpha": 0.5` makes it see-through. The Foundry importer keeps all of
  these, and a tile's `hidden`.
- `"model": { "src": "/assets/models/bridge.glb" }` stands a glTF model
  (`.glb`, or `.gltf` with its files beside it) on an image tile in the 3D
  view (docs/view3d.md); the 2D map shows only the tile's picture, usually
  `/art/ui/blank.svg`. The model is centred on the tile and stretched to it;
  `height` (feet, else in proportion), `elevation` (feet its base stands
  at, else the floor), `rotation` (degrees clockwise), `tilt` (`[x, z]`
  degrees) and `color` (a tint) shape it, and `opacity` (0–1; 0 hides it)
  lets it fade. `paint` repaints it as 3D Canvas's shaders do: `swaps`
  (up to three `{ "from", "to", "within" }`: colours within `within` of
  `from` become `to` at their own brightness) and an `overlay` (`{ "src",
"color", "strength", "repeat", "cover", "slope", "blackClear", "blend" }`:
  a picture laid over the top, by height and flatness). Paint colours are
  used as 3D Canvas uses them, channel by channel, not turned from sRGB.
  `"fill": "tile", "piece": 2`
  repeats it instead, one copy every 2 squares (floors, wall runs); `"fill": "fit"` keeps its proportions, as a creature's figure always does. The
  Foundry importer brings 3D Canvas model tiles this way.
- `"door": { "wall": "chest-lid", "style": "lift", "slide": 60, "ms": 400 }`
  makes a model tile a door model (a door, a chest, a secret slab, a
  drawbridge): its model moves as the door wall `wall` opens and shuts. The
  wall does the rest (blocking, locks, sound, Inspect). `style` is `swing`
  (turns `angle` degrees, default 90), `slide` (moves `slide`% of its length,
  default 50, toward `angle`), `lift` (rises `slide`% of its height), `fade`
  (goes see-through), `play` or `rewind` (plays the model's own animation
  forward or backward); `ms` is how long it takes (an animation takes its
  own length). The Foundry importer turns 3D Canvas door tiles into a door
  wall through the tile's long middle plus this.
- `"solid": { "points": [[0, 0], [1, 0], [0.5, 1]], "height": 10 }` raises a
  drawn shape on an image tile in the 3D view (a cliff, a ledge, a pool's
  rim): `points` are its corners as fractions of the tile's width and
  height, `height` is in feet, and `elevation`, `rotation` and `color` work
  as on a model. `texture` covers it in a picture (tinted by `color`),
  repeated `repeat` times across it (a lake's water, a wall's stone), with
  `maps` (`roughness`, `metalness`, `normal` pictures) and `roughness`,
  `metalness` and `opacity` (0 hides it: something only to stand on). The
  Foundry importer brings 3D Canvas's drawn polygons this way, with their
  picture, and a merged box as its pieces.
- `"only2d": true` keeps a tile on the flat map only: the 3D view leaves it
  out. The Foundry importer marks a 3D scene's top-down picture this way
  (3D Canvas raises it as a box high above the map, for the 2D view).
- `"terrain": { "heightmap": "/assets/hills.webp", "height": 50 }` raises
  ground across an image tile in the 3D view from a heightmap picture's red
  (black is high, or white with `"highIsWhite": true`); `height` is the
  highest peak over its bottom in feet, `window` (`[a, b, c, d]`) reads
  only part of the picture (u' = a + u/c, v' = b + v/d, wrapping),
  `detail` is segments a square, `elevation` and `rotation` work as on a
  model, and `layers` (up to four `{ "src", "color", "repeat", "from" }`,
  `from` a share of the height, or of flatness with `"bySlope": true`,
  fading over `blend`) paint it, then its `paint` (as on a model). `mask` (`{ "map", "src", "color",
"repeat" }`) paints one more picture on top wherever the `map` picture
  is white (paths, mud). The Foundry importer brings 3D Canvas terrain this
  way, as tall as its depth times its heightmap strength. A scene's `view3d.ground` of `"none"` leaves no ground
  beyond the map.
- A wall is a line from `a` to `b` that stops movement, sight, light and
  sound. Add `door` to make it a door: `"closed"`, `"open"` or `"locked"`.
  Open doors stop nothing.
- What a wall stops is set one by one, like Foundry's wall senses: `move` is
  `"none"` or `"normal"`; `sight`, `light` and `sound` are `"none"`,
  `"normal"`, `"limited"` or `"proximity"`. Missing means `"normal"`.
  - `limited`: the sense gets through one limited wall but not a second
    (tall grass, a thin curtain: the Foundry "terrain" wall).
  - `proximity`: the sense gets through from within `threshold` feet of the
    wall, e.g. `"threshold": { "sight": 10 }` (a fence you look over up close).
  - Usual kinds: a window is `"sight": "none", "light": "none"`; a terrain
    wall is `limited` for sight, light and sound; an invisible barrier has
    sight, light and sound `none`; an illusory wall is `"move": "none"`.
  - Old files with `"sight": false` still load, as a window.
- `"dir": "left"` or `"right"` makes a one-way wall: it stops movement,
  sight, light and sound only when they come from that side, looking from
  `a` to `b` (with `a` north of `b`, left is east). The editor draws an
  arrow the way things get through.
- `"secret": true` on a door: players are sent a plain wall until it is
  opened, and only the GM can open it.
- `doorSound` is what a door sounds like when it swings or its lock turns:
  `"wood"` (the default), `"stone"`, `"iron"`, `"gate"`, `"none"`, or an
  audio file. It is heard within 100 ft, quieter through walls.
- `"height": { "bottom": 0, "top": 10 }` (feet, like the Wall Height module):
  the wall only stops creatures and eyes whose elevation is from `bottom` up
  to, not including, `top`; a flier above it sees and flies over. Either end
  may be left out (no limit). Lights shine from the ground.
- `"tile": "<tile id>"` fastens a wall (or a light) to a tile, like a prefab
  house: moving the tile in the editor moves it, and copying or deleting the
  tile takes it along. `check-game` reports a tile the scene doesn't have.

  ```json
  { "id": "hedge", "a": [0, 0], "b": [500, 0], "sight": "limited", "light": "limited", "sound": "limited" }
  ```

- Ids must be unique within the list.

### Objects

Doors, chests, levers and the like are objects, as in BG3: in the tokens
mode the one under the pointer glows gold (a picture tile around its
outline, a door along its leaf, a 3D model lit, a pile's ring), and a player
right-clicks one to **Inspect** it (a card with its name, picture, state
and description) or to use it, and the creature they act with walks up to
it first. Objects are not a list of their own; they are what is already on
the map:

- a door (a wall with `door`),
- a pile of loot or a merchant (a token with `pile`, see "Actors and tokens"),
- a tile with a click `trigger` (a lever, a lift button), or any tile with a
  `description` (a statue, a mural: inspect only).

A door takes `name` (else "Door") and `description`; a tile takes
`description` beside its `name` (else a name read off its picture's file,
`Lever_Wood-02.webp` is "Lever wood"); a pile shows its token's name and
biography. A closed secret door's name and description are kept from
players with the rest of it.

```json
{
  "id": "cell",
  "a": [700, 800],
  "b": [800, 800],
  "door": "locked",
  "name": "Cell door",
  "description": "Rusted iron bars."
}
```

## Lights

`lights.json` lists placed light sources. Radii are in feet, like the
rules: `bright` light, then `dim` light beyond it.

```json
[
  { "id": "hearth", "x": 550, "y": 250, "bright": 20, "dim": 20, "color": "#ff9a40", "animation": "flicker" },
  { "id": "moonwell", "x": 1500, "y": 300, "bright": 10, "dim": 30, "color": "#7ab0ff", "animation": "pulse" },
  { "id": "shadow", "x": 900, "y": 1400, "bright": 15, "darkness": true }
]
```

`"hidden": true` puts a light out: it stays on the map but doesn't shine
until a trigger (a `visibility` action on `lights`) or the GM lights it.

| Field            | Meaning                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| `color`          | Colour of the light; default a warm white.                                       |
| `animation`      | `"flicker"` for flames, `"pulse"` for magic.                                     |
| `darkness`       | Magical darkness (the Darkness spell) of radius `bright + dim` instead of light. |
| `angle`          | Degrees of a beam (a lantern, a lighthouse); left out, it shines all round.      |
| `rotation`       | Which way the beam faces, degrees clockwise from facing south (down the map).    |
| `walls`          | `false`: it shines through walls (a magical glow).                               |
| `luminosity`     | How strongly it lights, 0 to 1 (default 1).                                      |
| `attenuation`    | How softly it fades at its edges, 0 (a hard edge) to 1 (default 0.5).            |
| `colorIntensity` | How much of `color` it casts, 0 (plain warm light) to 1 (default).               |
| `lasts`          | Game seconds it burns once lit (a campfire: 28800); left out, it never goes out. |
| `endsAt`         | The game-clock second it goes out; the server works it out from `lasts`.         |
| `name`           | What gives it ("Torch"), named in the chat when it burns out.                    |

The GM can also draw walls, doors and windows, place, drag and erase lights,
and set the time of day from the map tools in the game (bottom left).

Walls stop light like they stop sight (a light whose `walls` is `false`
ignores them; a beam lights, and lets you see, only inside its angle). A token carries a light with the same
fields in `light`. A placed light with `activeAt: [from, to]` shines only
while the darkness is in that band (`[0.6, 1]` lamps lit at night; a band
written high to low wraps round, `[0.8, 0.2]` dusk to dawn). Everything with
`activeAt` reads it through `activeAt()` in `shared/levels.ts`, the one place
time of day is read, so world time (step 13) changes it in one spot. Magical darkness puts out every other light, and only
devil's sight, truesight, blindsight and tremorsense work inside it.

## Scene levels

A scene can have floors, like Foundry's Levels module (and Foundry v14's
scene levels). `levels` in `scene.json` names them by the elevation (feet)
where each starts:

```json
"levels": [
  { "id": "ground", "name": "Ground", "bottom": 0, "top": 10 },
  { "id": "gallery", "name": "Gallery", "bottom": 10, "top": 20, "sees": ["ground"] }
]
```

A token is on the highest level its `elevation` (feet, default 0) reaches.
`top` is where the floor's ceiling is (missing: the next level's bottom); the
3D view stands walls up to it. `sees` lists the other levels seen from this
one: their tiles draw beneath it (lower floors under higher ones), and a
creature on one of them can be seen from here, in that floor's own light,
past the walls of the viewer's floor (a gallery over a hall, a balcony).

Tiles, walls, lights, drawings, notes, templates, regions and sounds take a
`level`, or `levels` (a list) when they are on several floors (a staircase,
a pillar through two storeys); with neither they are on every level. A
token sees, and is lit and blocked by, only what is on its own level, and
players don't see creatures on floors their own doesn't see
(`tokensVisibleTo` in `shared/permissions.ts`, the fog keeper on the server,
`Vision` on the client). The map draws the floor shown: the GM sees the
floor of the creature they selected, or picks one (or every level) in the
map tools (creatures on other floors show faintly); a player sees their
creature's. The floors above the one shown stand over it as roofs, as in
Foundry's Levels: their tiles (and tiles over every floor, a roof) are drawn
over the creatures and fade while one stands under them, together with what
lies wholly on them. A floor's own pictures lie under the creatures on it,
even those Levels keeps overhead (the upper floor's picture, a trapdoor);
`canvas/floor-tiles.ts` on the client picks them.

A region only works for creatures on its own levels. These behaviours move
creatures between floors: `level` (always to that level), `stairs` (between
two levels: up from one, down from the other; walk out and in again to go
back) and `elevator` (whoever moves the creature picks one of its `floors`,
or of every level when it has none) work when a walk ends inside the region,
so walking past the stairs keeps a creature on its floor. Players see these
ways between floors (an outline and a stairs sign) even when the region isn't
`visible`. A `fall` region is a hole: a creature walking over it drops to
the floor below where it stepped in, and a `teleport` with a `level` lands
on that floor. The GM may also move any creature to any level with the
`changeLevel` message.

A creature with no `elevation` stands at 0 ft. It walks, sees and is pushed
around among the walls of its own floor only (`wallsOnFloor` in
`shared/levels.ts`), and creatures on other floors don't get in its way.

## Drawings, notes, templates, regions and sounds

Each is a list in the scene folder (schemas in `shared/scene-items.ts`).
Every item has an `id`, and may have `level`, `hidden` (players don't get
it) and `locked`.

**Drawings** (`drawings.json`). Boxes have `x, y, w, h`: `"shape"` is
`"rect"`, `"ellipse"` or `"text"` (with `text`, `fontSize`, `textColor`).
Paths have `points` (`[[x, y], ...]`): `"polygon"`, `"line"` or
`"freehand"`. All take `stroke`, `strokeWidth`, `fill`, `fillAlpha`.
Players draw too: theirs carry their seat id as `author`, and they can
change and delete only their own.

```json
[
  {
    "id": "route",
    "shape": "line",
    "points": [
      [100, 100],
      [900, 400]
    ],
    "stroke": "#ff4040",
    "strokeWidth": 6
  }
]
```

**Notes** (`notes.json`): `x, y`, `label`, `icon`, `color`, and the
journal `entry` (and `page`) it opens. Players see a note only when they may
see its entry.

**Templates** (`templates.json`): `shape` `"circle"`, `"cone"`, `"line"` or
`"square"`, origin `x, y`, `distance` in feet (a circle's radius, a cone's or
line's length, a square's side), `direction` in degrees clockwise from east,
`width` (lines, feet, default 5), `angle` (cones, default 53.13), `color`,
`author`. Lasting spells (spirit guardians, moonbeam) are templates the
server keeps: id `zone-<effect>`, `effect` naming the creature and effect,
`attachedTo` when it moves with its caster. The GM may move one, and the
spell then hits where the template is; it goes when the spell ends. A template
with `endsAt` (a game-clock second, see time.json) goes when the clock reaches it.

**Regions** (`regions.json`): `points` (3 or more), `name`, `color`,
`visible` (players see its outline), `disabled`, `activeAt`, and
`behaviors`, run in order when a token walks in:

| Behaviour                                                                  | What it does                                                                                                                                                      |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ "type": "difficult", "multiplier": 2 }`                                 | Moving through costs that many times as much (paths go round it if they can).                                                                                     |
| `{ "type": "trap", "message": "…", "once": true, "system": { … } }`        | The game system springs it; D&D: `system` is `{ "save": "dex", "dc": 15, "damage": "2d6", "type": "piercing", "half": true }`. `once` turns the region off after. |
| `{ "type": "teleport", "to": [x, y], "scene": "cellar", "level": "loft" }` | Moves the token there (and, to another scene, the players who own it), onto `level` when named.                                                                   |
| `{ "type": "level", "to": "loft" }`                                        | Takes the token to that level (its elevation becomes the level's bottom).                                                                                         |
| `{ "type": "stairs", "between": ["ground", "loft"] }`                      | Stairs: a token on one of the two levels goes to the other.                                                                                                       |
| `{ "type": "elevator", "floors": ["cellar", "ground", "loft"] }`           | Asks whoever moves the token which of these floors to go to (none listed: every level).                                                                           |
| `{ "type": "fall", "to": "cellar", "damage": true }`                       | A hole: a token walking over it falls to `to` (missing: the floor below), stopping where it stepped in; `damage` lets the system hurt it (D&D: 1d6 per 10 ft).    |
| `{ "type": "reveal" }`                                                     | The players whose token walked in see the whole region as explored.                                                                                               |
| `{ "type": "message", "text": "…", "gmOnly": true }`                       | Says it in chat (to the GM alone with `gmOnly`).                                                                                                                  |

A region also takes every tile trigger action (`image` with a `tile`,
`visibility`, `sound`, `door`, `journal`; see "Tiles and walls").

**Sounds** (`sounds.json`): `x, y`, `radius` (feet), `src`, `volume` (0
to 1, default 0.5), `walls` (default true: each wall between muffles it),
`activeAt`, `name`. A player hears them from their token, the GM from the
middle of the screen.

## Journal entries, roll tables, playlists, macros and cards

One file each, in `journals/`, `tables/` and `playlists/` (schemas in
`shared/journals.ts`). Each has `id`, `name`, and may have `folder` (see
"Folders"), `sort` and `ownership` (missing: only the GM sees it; `limited` shows the title,
`observer` the pages).

```json
{
  "id": "the-well",
  "name": "The Old Well",
  "ownership": { "default": "observer" },
  "pages": [
    { "id": "story", "name": "Story", "text": "Dug **long** ago." },
    { "id": "map", "name": "Map", "kind": "image", "src": "/assets/well.webp" }
  ]
}
```

Page text can link and roll. `@journal[the-well#map]{the map}` opens an
entry (at a page), `@actor[bram]` a sheet, `@scene[cave]` takes the GM there,
and `@spell[fireball]`, `@item[longsword]`, `@monster[goblin]` show the rules
card; a link without `{label}` shows the document's name. `[[/r 2d6+3]]` (or
`[[1d4]]{label}`, `[[/damage 2d6 fire]]`) rolls in chat, and
`[[/check perception 15]]` rolls the check for your selected creature (the
GM's click asks it of the selection, or the party). Foundry's own links
(`@UUID[JournalEntry.x]{label}`, `@Actor[x]`, compendium spells and items by
name) are read too, and the importer points links between entries at the
entries it made.

An entry with `quest` is in the quest log: `status` (`"active"`, `"done"`,
`"failed"`) and `objectives` (`text`, `done`). An entry with `date` (game
seconds, see time.json) is a calendar note on that day; when the clock reaches
it, the chat says so ("Today: Find the well"), to everyone if every player
may see the entry, else to the GM alone:

```json
{
  "id": "find-the-well",
  "name": "Find the well",
  "date": 86400,
  "quest": { "status": "active", "objectives": [{ "text": "Ask the innkeeper", "done": true }] }
}
```

Players read entries in the adventure book (J): quests, maps, lore, the
party log and the timeline. `"book": "map"` shelves an entry under Map (its
image pages shown large), `"book": "log"` under the party log; dated entries
make the timeline, and the rest is lore. A player's own note has `author`
(their player id): they write, rename and remove it, and share it with the
party by setting its `ownership` default to `observer`. Notes can't be quests
or calendar notes. The Foundry importer brings Simple Quest's pages along:
each quest page becomes a quest (its list items the objectives), map pages
go under Map, and entries in its party folder under the party log.

A roll table has `results` (`text`, `weight` default 1, `drawn`), and
`replacement: false` draws each result once until it is reset. A playlist
has `mode` (`"sequence"`, `"shuffle"`, `"together"`), `volume`, and
`tracks` (`id`, `name`, `src`, `volume`, `repeat`, `playing`); players are
sent the playlists that are playing, and the GM's client moves on to the
next track when one ends.

A macro (`macros/<id>.json`) is a `kind` (`"chat"`) and a `command`: chat
lines, one per line, posted as if typed, so `/r 1d20+5 stealth` rolls. It may
have an `img` for its hotbar tile. Players are sent the macros shared with
them (`ownership`) and their own: a macro with `author` is that player's,
who may change and remove it. Anyone drags a macro from the Macros tab onto
the hotbar, where it sits as `"macro:<id>"`; run from a token it speaks with
the token's name. A `"script"` macro's `command` is JavaScript the GM runs in
their own browser (see `docs/scripting.md`); only the GM writes, is sent or
runs those.

```json
{ "id": "rally", "name": "Rally", "kind": "chat", "command": "To me!\n/r 1d6 inspiration" }
```

### Cards

A file in `cards/` is a stack of cards: a `kind` of `"deck"` (drawn from,
face down), `"hand"` (a player's own) or `"pile"` (played cards, face up),
and its `cards`, top first. A card has an `id`, a `name` and the `origin`
deck it belongs to, which gathering the deck brings it back to; its face is
a `face` picture, or its `value` and `suit` ("A", "♠"). It may have a `back`
picture and `text`; a stack's `back` covers cards without one. A card is
known by `<origin>/<id>`, so two decks may share card ids.

Who sees what is `ownership`: a player who may only know of a stack
(limited) is sent its name and how many cards it holds, not the cards;
observer shows them, and owner lets them draw into it, shuffle it, and play
or pass its cards. Players move cards only that way (the server refuses
their edits to `cards`); the GM deals and gathers decks back. The Cards
tab makes a deck of 52 playing cards, empty decks, piles, and a hand for
each player.

```json
{
  "id": "fate",
  "name": "Deck of fate",
  "kind": "deck",
  "ownership": { "default": "limited" },
  "cards": [{ "id": "the-tower", "name": "The Tower", "origin": "fate", "face": "/assets/cards/tower.webp" }]
}
```

## Actors and tokens

A creature's sheet is an **actor**, one file per actor in `actors/<id>.json`.
A **token** is an actor standing on a scene: an entry in the scene's
`tokens.json` that says where, and which actor:

```json
{ "id": "bram", "x": 650, "y": 650, "actor": "bram", "linked": true }
```

- **Linked** tokens (characters, named villains, a companion) read and write
  their actor: damage on the token is damage on the actor, and every token of
  it shows the same hit points and effects.
- **Unlinked** tokens (goblins, bandits) are copies. Each keeps only what
  differs from its actor in `delta`: its wounds, its effects, a numbered
  name. `null` in `delta` removes a field the actor has. The actor stays the
  clean template, so three goblins from one actor each have their own hit
  points:

```json
[
  { "id": "goblin-1", "x": 2850, "y": 1650, "actor": "goblin", "linked": false },
  {
    "id": "goblin-2",
    "x": 3250,
    "y": 1450,
    "actor": "goblin",
    "linked": false,
    "hidden": true,
    "delta": { "name": "Goblin 2", "hp": 3 }
  }
]
```

Leave out `linked` and a token is linked unless its actor is a monster (an
actor can say otherwise with its own `"linked"`). Only `x`, `y`, `hidden`,
`banished`, `visibleTo`, `summon` and `leader` belong to the token itself;
everything else on a token with an actor goes in `delta`, and `check-game`
says so. `banished` is the server's: a creature sent away by a spell
(banishment, blink, maze) is hidden with it and shown again when the spell
ends. `trueForm` is the server's as well: a creature polymorphed in 2014 keeps
its own hit points there until it changes back.

A token without `actor` carries its whole sheet itself, with the actor fields
below written straight on it. Summons are like that; they vanish when their
spell ends.

In the game the GM places actors from the Actors tab (monster actors as
numbered unlinked copies, the rest linked), and the token sheet's edit mode
has **Unlink**, or for a copy **Save to actor** (its stats, gear and looks
become the actor's; its wounds and name stay its own), **Reset** (start over
from the actor) and **Link**. Deleting an actor leaves its tokens carrying
its sheet themselves.

An actor looks like this; the fields below are an actor's (or a token's
without one):

```json
{
  "id": "bram",
  "name": "Bram",
  "size": 1,
  "color": "#c0603a",
  "speed": 30,
  "ownership": { "default": "limited", "player2": "owner" }
}
```

| Field                        | Meaning                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | Lowercase letters, digits, dashes. An actor's must match its file name.                                                                             |
| `x`, `y`                     | A token's centre in pixels (a square centre on a square grid).                                                                                      |
| `size`                       | In squares: 1 medium, 2 large, 3 huge. Default 1.                                                                                                   |
| `color`                      | Disc colour behind the placeholder when there is no picture.                                                                                        |
| `img`                        | Picture URL, drawn as-is: use a top-down cut-out with transparency.                                                                                 |
| `displayName`, `displayBars` | When its name and hit point bar show: `never`, `control` (while its owner has it selected), `ownerHover`, `hover`, `owner`, `always` (the default). |
| `scale`                      | How big its picture is drawn in its square, 0.2 to 3. Default 1.                                                                                    |
| `mirrorX`, `mirrorY`         | Flip its picture left to right, or upside down.                                                                                                     |
| `ring`                       | A ring round its picture: `{ "color": "#e0b040", "background": "#202020" }`.                                                                        |
| `filter`                     | A colour filter over its picture: `grayscale` (petrified), `sepia`, `invert`, `ghost` (pale, see-through) or `shadow` (dark).                       |
| `model`                      | Its figure in the 3D view: `{ "src": "/assets/minis/orc.glb" }`, as wide as its square (see `model` on tiles).                                      |
| `randomImg`                  | With `"img": "/assets/tokens/goblin-*.webp"`: each new unlinked copy picks one of the files the `*` pattern matches.                                |
| `speed`                      | Walking speed in feet. Default 30.                                                                                                                  |
| `ownership`                  | Who may see, read and act with it; see Ownership below.                                                                                             |
| `darkvision`                 | Range in feet. Also `blindsight`, `tremorsense`, `truesight`.                                                                                       |
| `devilsSight`                | Sees in magical and nonmagical darkness to this range, in feet.                                                                                     |
| `light`                      | A light it carries, like a placed light: `{ "bright": 20, "dim": 20 }`.                                                                             |
| `hidden`                     | A token's: `true` = only the GM sees it.                                                                                                            |
| `visibleTo`                  | A token's: only these players (and the GM) see it. Used for illusions.                                                                              |
| `folder`                     | An actor's: the id of its folder in the Actors list (see "Folders").                                                                                |

### Ownership

`ownership` gives each player a level, like Foundry's, and `default` is the
level of everyone not named:

| Level      | The player                                                                              |
| ---------- | --------------------------------------------------------------------------------------- |
| `none`     | sees its token on the map, nothing more; any other document is not sent to them at all. |
| `limited`  | sees it on the map but not its sheet, only how hurt it looks.                           |
| `observer` | reads its sheet and sees through its eyes.                                              |
| `owner`    | moves and acts with it, and edits its sheet.                                            |

As in Foundry, ownership never hides a token: whether players see one is up
to `hidden`, `visibleTo` and their sight. A creature without `ownership` is
`limited` for everyone. The GM is owner of
everything and an observer seat is never more than observer (and observes
every creature a player owns). A linked token's ownership is its actor's; an
unlinked copy can have its own in `delta`. Players may change by hand only
what their level lets them (see `docs/edits.md`); `ownership`, position,
`hidden` and the actor link stay with the GM.

Senses missing on a token come from its monster's stat block. Players see a
creature when one of their tokens has a clear line to it and it is lit (even
dimly) or within darkvision; blindsight and truesight see in any darkness,
tremorsense feels creatures through walls, and an `invisible` creature (a
condition in its `effects`) is found only by blindsight, truesight,
tremorsense or an effect with `seeInvisible`.

A token with a `monster` and no `img` uses that monster's painted token, if one
has been imported (see [token-art/README.md](token-art/README.md)).

## Creatures: stats, monsters and gear

A token with `monster` or `stats` is a creature: it gets a hit point bar, can
attack and joins fights. Monster and item ids come from the SRD content in
`packages/system-dnd5e/content/srd/`.

**Rules edition.** `game.json` has `"rules": "2014"` (the default when it is
missing) or `"2024"`. Monsters come from SRD 5.1 (`monsters-5.1.json`) under 2014 rules
and SRD 5.2 (`monsters-5.2.json`) under 2024 rules; the weapon and armor list
(`items.json`) is shared. A character can play by the other edition, e.g. a
2024 class in a 2014 game, with `"stats": { "rules": "2024" }`; that token's
monster id and rules then come from that edition.

**Game settings.** `game.json` `"settings"` holds the GM's table rules, set
from the settings menu (the cog): `"encumbrance"` is `"capacity"` (the
default: over Strength × 15 lb a character's speed drops to 5 ft),
`"variant"` (the PHB variant: over Strength × 5 lb speed −10 ft, over × 10 lb
−20 ft and disadvantage on attacks and on Strength, Dexterity and
Constitution checks and saves) or `"off"` (weight isn't counted). The same
menu changes `rules`.

A monster uses the stat block as is. Anything in `stats` overrides it, and
`hp` tracks damage (leave it out for an unhurt creature), and `tempHp` holds
temporary hit points, which are lost first:

```json
{ "id": "goblin-1", "name": "Goblin", "x": 2850, "y": 1650, "monster": "goblin", "hp": 4 }
```

A character is built from `stats` and the gear it has equipped. AC comes from
worn armor and shield, attacks from equipped weapons (finesse weapons use the
better of STR and DEX, ranged weapons DEX), proficiency from `level`:

```json
{
  "id": "bram",
  "name": "Bram",
  "x": 650,
  "y": 650,
  "ownership": { "default": "limited", "player2": "owner" },
  "stats": {
    "class": "Fighter",
    "level": 3,
    "maxHp": 28,
    "abilities": { "str": 16, "dex": 12, "con": 14, "int": 10, "wis": 12, "cha": 8 }
  },
  "inventory": [
    { "item": "longsword", "equipped": true },
    { "item": "chain-mail", "equipped": true },
    { "item": "shield", "equipped": true },
    { "item": "potion-of-healing", "qty": 2 }
  ]
}
```

| `stats` field                                  | Meaning                                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level`                                        | Character level, sets proficiency.                                                                                                                   |
| `class`                                        | Shown on the character sheet.                                                                                                                        |
| `classes`                                      | A multiclassed character: `[{ "class": "fighter", "level": 3, "subclass"? }, ...]`, first class first, instead of `class` and `level`.               |
| `xp`                                           | Experience points. The GM's Encounter panel awards them; the sheet's title shows the XP to the next level, or the level reached.                     |
| `abilities`                                    | `str dex con int wis cha` scores; missing ones are 10 (or the monster's).                                                                            |
| `maxHp`                                        | Hit point maximum.                                                                                                                                   |
| `ac`, `proficiency`                            | Override the computed values.                                                                                                                        |
| `attacks`                                      | Extra attacks: `{ "name", "kind": "melee"\|"ranged", "toHit", "reach" or "range": [normal, long], "damage": [{ "dice": "1d6+2", "type": "fire" }] }` |
| `resistances`, `immunities`, `vulnerabilities` | Damage types, e.g. `["fire"]`.                                                                                                                       |
| `proficiencies`                                | Armor, weapons, tools and languages by id, e.g. `["light-armor", "martial-weapons", "longsword", "thieves-tools", "elvish"]` (see Proficiencies).    |

**Coins, containers and attunement.** `currency` holds the coins carried,
`{ "pp": 1, "gp": 40, "ep": 0, "sp": 12, "cp": 30 }` (fifty coins weigh a
pound). An entry is packed into a container entry by naming it: give the
container an `id` and the packed entries `"in": "<that id>"`. Containers are
gear with `"container": { "capacity": 30 }` in pounds (backpack, pouch, sack,
chest); with `"weightless": true` (bag of holding) what is inside weighs
nothing. A character carrying more than Strength × 15 lb (doubled per size
above medium, halved for tiny) moves 5 ft at most; monsters don't count their
loot. Magic items with `"attunement": true` work only while the entry is
`"attuned": true` (three at most, the file is refused with a fourth), and an
item's `"bonus": { "ac": 1, "saves": 1 }` counts while it is equipped (and
attuned, if it needs that). Owners pack, attune and count coins from the
sheet without edit mode.

```json
"currency": { "gp": 25, "sp": 8 },
"inventory": [
  { "id": "pack", "item": "backpack" },
  { "item": "rope", "in": "pack" },
  { "item": "ring-of-protection", "equipped": true, "attuned": true }
]
```

**Item piles and merchants**, like the Item Piles module: a token with
`pile` is a heap of things rather than a creature (no sheet; it doesn't block
walking). Its `inventory` and `currency` are what it holds, and everyone who
can see it sees them, unless it is `locked` (only the GM opens it). Click it
to open its window: creatures take from loot and put their gear in it, buy
from a merchant at `buy` times the item's `price` and sell to it at `sell`
times (a merchant's purse never runs dry; what has no price can't be traded).
Gear dragged from a sheet onto the ground drops as a new pile of loot (or
onto the pile already there). A loot pile goes once it is empty unless
`keepEmpty`; an `infinite` merchant never runs out. Creatures trade within
`reach` feet. The GM makes any token a pile from its right-click menu.

| `pile` field | Default | Meaning                                      |
| ------------ | ------- | -------------------------------------------- |
| `kind`       | `loot`  | `loot` or `merchant`                         |
| `buy`        | 1       | What a merchant asks, times the item's price |
| `sell`       | 0.5     | What a merchant pays, times the item's price |
| `reach`      | 10      | Feet a creature must stand within to trade   |
| `locked`     |         | Only the GM may open it                      |
| `keepEmpty`  |         | A loot pile stays once emptied (a chest)     |
| `infinite`   |         | A merchant whose stock never runs out        |

```json
{
  "id": "smithy",
  "name": "Smithy",
  "x": 450,
  "y": 250,
  "img": "/assets/stall.webp",
  "pile": { "kind": "merchant", "buy": 1.2 },
  "inventory": [{ "item": "longsword", "qty": 3 }, { "item": "shield" }]
}
```

Item prices are in gold pieces (`"price": 15`; 0.1 is a silver piece). The
SRD's mundane gear has its book price; magic items have none.

**Spells and features.** `stats.spells` lists the spell ids a character
knows or has prepared (from `spells-5.1.json` or `spells-5.2.json`, by the
token's edition). A `class` named after an SRD class (Wizard, Fighter, ...)
gives that class's spell slots, spellcasting ability and features by `level`,
from `classes-5.x.json`. A homebrew class or a monster that casts uses
`"spellcasting": { "ability": "int", "progression": "full" | "half" | "third" | "pact", "level": 5 }`.
A creature with no spellcasting but homemade spells (`own.spells`, made on
its sheet) casts them at their own level without a slot, with its best of
Int, Wis and Cha, or the ability `"spellcasting": { "ability": "cha",
"progression": "none" }` names (picked on the sheet's Spells tab).

**Homebrew classes.** The GM makes classes in the Compendium tab
(Homebrew), and each is a file in `homebrew/<id>.json` with `"kind": "class"`
and the fields of an SRD class: `hitDie`, `saves`, `spellcasting`,
`features` (`id`, `name`, `level`, `description`, `uses` by level,
`recharge`, `action`), `multiclass`. Custom advancement adds `scales`
(numbers by class level the sheet shows, such as a pool's size), `choices`
(`id`, `name`, `count` by level: features with that `choice` are options a
character picks, kept as `"<class>/<feature>"` in `stats.features`),
`subclassLevel` and `subclasses` (`id`, `name`, `description`, `features`).
Level tables are `[[level, value], ...]`. A character takes it like an SRD
class (`"class": "illusionist"`), a subclass through `classes`
(`[{ "class": "illusionist", "level": 3, "subclass": "dreamer" }]`). Shared
(`ownership.default` `"observer"`) homebrew reaches the players' sheets;
without ownership only the GM sees it. The character creator and
level-up screen offer the game's homebrew classes that the player may read (two skills of any, the class's subclasses, no
starting kit). A player's character keeps a copy of each one it takes
(`homebrew` in the character), refreshed from the game whenever it is saved,
and its token carries the copy as `own.classes`, so it works in any game; a
game's own class of that id wins over the copy.

**Point pools (homebrew classes).** A class may spend points from one pool
instead of slots or uses (`pool`, see `system-dnd5e/src/power-schema.ts`):
`{ "id", "name", "ability", "max": [[1, 12], ...], "recharge": "short" | "long",
"concurrent": 0.5, "weight": {...}, "reserveTimes": [[9, 0.5]] }`. `ability`
gives its features DC 8 + proficiency + modifier and attack proficiency +
modifier; `concurrent` is the share of the pool lasting uses may hold at once;
`weight` is how heavy a creature is for costs: the tier of its challenge
rating or level (`tiers`, `[from, tier]`) times `base` + `per` × its `ability`
modifier, at least `min`. A feature with `cost` (a formula: numbers, names,
`+ - * /`, brackets) spends the pool: the formula is worked out for each target
and added up, with `weight` (the target's), `first` (1 for the first target),
`linked`, `level`, the `inputs` (numbers the user enters, `{ "id", "name",
"min", "default" }`) and each of its `options` groups (`{ "id", "name",
"pick": "any" | "one", "required", "list": [...] }`: the sum of the picked
options' `cost`). An option has a `level` (learned earlier when the character
has `"<class>/<option>"` in `stats.features`), sets spell fields over the
feature's `spell` (`set`; an `effect` adds to the feature's), may multiply
damage (`times`) and changes from a level (`upgrades`). Other fields:
`hold` (the cost stays held against the concurrent share while its effects
last), `reserve` (it comes off both maximums until let go: the sheet's Let go
button), `group` (features sharing one concentration), `linkedTimes` (targets
linked to the user cost this times as much), `times` (damage multiplier by
level), `modFrom` (`{mod}` in its spell counts from this level), `upgrades`
(`[{ "level", "set" }]`, fields set over the feature from a level), `quick`
(a bonus action when it costs this share of the pool or less), `quickAny`
(once a turn a bonus action whatever it costs), `followUp` (after using it
with an action, that feature may be a bonus action this turn), `ritual` (only
outside fights), `consumes` (ends the user's newest held use of that
feature) and `costWhenSpent` (the cost once its `uses` are gone). Spells gain
`damageTimes`, `minInt` (mindless creatures are immune), `linkedOnly` (only
creatures under one of the caster's `linked` effects, at any distance),
`maxWeight`, `split` (one attack, its damage shared out among the targets)
and `crowd` (a save for every creature when it damages `atLeast` of them);
effects gain `linked`, `noReactions`, `bonusFeature` (Mind's Eye uses `saveAdvantageVs`),
and auras `maxWeight`. Features gain `reaction` (Misdirection, Redirect,
Unreal Self, Phantom Step: offered as an attack is about to hit or a
Dexterity save is rolled) and a feature spell may `summon` a creature built
for the class level and the pool's numbers (Shadow Substance). A feature's
`freeCasts` entry with a `cost` formula (in `level`, the level it is cast at)
pays for that spell with the pool's points instead of a use, so the points
cast spells like slots: `{ "spell": "silent-image", "cost": "2 * level" }`.
A class with no spellcasting casts them with the pool's ability.

**Homebrew items and spells.** A homebrew file with `"kind": "spell"` has
the fields of an SRD spell; one with `"kind": "item"` keeps the item's own
fields in `item` (a weapon has a `kind` of its own):
`{ "id": "dusk-blade", "kind": "item", "name": "Dusk Blade", "item": { "type": "weapon", ... } }`.
They join the game's content like a pack's: sheets carry them by id and
the Compendium lists them under Homebrew. The Foundry import makes them
from the world's Items sidebar.

**Encounters and experience.** The GM's Encounter button (beside Start
combat) weighs the monsters on the scene against the party: the
player-owned characters with class levels. In 2014 rules the monsters' XP
(by challenge rating) is multiplied by their number (one step more for a
party under three, one less for six or more) and measured against the
easy, medium, hard and deadly thresholds; in 2024 their XP is measured
against the low, moderate and high budgets, and past high is "beyond".
Monsters can be left out with their toggles. Award XP splits the
monsters' XP evenly, adds it to each character's `stats.xp` and says in
chat who has enough for a new level.

**Checks.** A creature's owner rolls ability and skill checks from the
sheet's Features page: the ability modifier, plus proficiency for a skill
in `stats.skills`, with disadvantage when poisoned, frightened or (2014)
exhausted, and an effect's `checkBonus` dice. The GM's Request check button
asks the selected creatures (else the party) for one: each for itself, as a
group (it passes when at least half pass the DC), or as a contest between
two (the second may use another skill, Acrobatics against Athletics; the
higher total wins, a tie changes nothing). The request is a chat card where
each owner presses Roll; the card fills in and says the result.

**Proficiencies.** `stats.proficiencies` lists armor (`light-armor`,
`medium-armor`, `heavy-armor`, `shields`), weapons (`simple-weapons`,
`martial-weapons`, 2024's `martial-light-weapons` and
`martial-finesse-light-weapons`, or one weapon by item id, `longsword`),
tools (`thieves-tools`, `smiths-tools`, `lute`, `dice-set`...) and languages
(`common`, `elvish`, `thieves-cant`...); the ids are in
`system-dnd5e/src/proficiency-catalog.ts`. The creator writes what the class,
species and background give and what the player picked. A character's
classes add theirs on top (the first class all of them, later ones their
multiclass share; `proficiencies` in class-automation.json). A character
adds its proficiency bonus only to weapons it is trained with, and armor or
a shield it isn't trained with gives disadvantage on attacks and Strength
and Dexterity checks and saves, and stops its spells. A class that doesn't
say what it gives (some homebrew) leaves its character trained with
everything, as monsters are. Owners roll a check with a tool by clicking it
on the sheet (the GM's Request check lists tools too); proficiency is added
when the creature has the tool. Words written before the list (`"Thieves'
tools"`) still count when they name one.

**Multiclassing.** `stats.classes` splits a character's levels over several
classes. Proficiency, cantrips and scroll reading follow the total level;
each class gives its features at its own level (their tables, like rage
damage, read that level); extra attack is the best of the classes and sneak
attack follows rogue levels. Saving throws come from the first class. Spell
slots come from the combined caster level (full casters count every level,
half casters half, rounded down in 2014 and up in 2024 or for classes that
cast from 1st level, third casters a third), unless only one class casts,
which keeps its own table. A warlock's pact slots are added apart and come
back on a short rest. Spell attacks and DCs use the first casting class's
ability. Hit dice are one pool per die; spending takes the biggest first.
In the level-up screen a player picks the class gaining the level; taking a
new one needs 13 in its main abilities and in the current classes' (a
class's `multiclass: { all, any }` in `class-automation.json`).

```json
"stats": {
  "class": "Wizard",
  "level": 3,
  "abilities": { "int": 16, "dex": 14, "con": 14 },
  "spells": ["fire-bolt", "magic-missile", "shield", "misty-step"],
  "features": ["barbarian/rage"]
}
```

`stats.features` grants class features on top of the class's own, as
`"<class>/<feature>"` (dragging a feature from the Compendium onto a sheet
adds one). `stats.species` and `stats.lineage` (set by the character
creator) give the species' spells (`content/srd/species-automation.json`):
a tiefling's infernal legacy, a 2024 elf's, gnome's or tiefling's lineage.
Cantrips come at 1st level; the others are features cast once a long rest
without a slot from their character level on. A character with no
spellcasting casts them with its best mental ability. A spell scroll is an inventory entry with the spell on it:
`{ "item": "spell-scroll", "spell": "fireball", "qty": 1 }`. Reading it casts
the spell at its own level without a slot, with the scroll's save DC and
attack bonus (13/+5 up to 2nd level, 15/+7, 17/+9, 18/+10, 19/+11 for 9th),
and uses the scroll up.

**Made on the sheet.** Items, spells and features that exist only on one
creature (the sheet's New item, New spell and New feature buttons) live in
its `own` field, written like compendium entries: `"own": { "items": [...],
"spells": [...], "features": [...] }`. Own items are carried through
`inventory` by their id like any other item, own spells are known without
listing them in `stats.spells`, and own features are granted. Existing items,
spells and features are added by dragging them from the Compendium.
`own.monsters` holds stat blocks of its own: a creature a spell brings with
its stat block (2024 giant insect, summon dragon, find steed, animated
objects) carries the one the server built for the slot it was cast with, and
its `monster` names it.

**Biography.** `biography` is the creature's story, looks and personality as
text (a blank line between paragraphs; content links and inline rolls work as
in journals), shown on the sheet's Biography tab to whoever may read the sheet.
The Foundry importer fills it from the actor's biography.

The server writes the rest of a creature's magic to its token, and you can
edit it too:

| Token field     | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effects`       | What is affecting it now: `[{ "id", "name", "rounds"?, "source"?, "concentration"?, ...modifiers }]`.                                                                                                                                                                                                                                                                                                                                 |
| `deathSaves`    | `{ "successes", "failures", "stable"?, "dead"? }`: a character at 0 hp rolls these at the start of its turns. Monsters just die at 0.                                                                                                                                                                                                                                                                                                 |
| `concentration` | `{ "spell", "name" }`: the spell it concentrates on. Ending it ends that spell's effects and summons.                                                                                                                                                                                                                                                                                                                                 |
| `spent`         | `{ "slots": [1, 0], "uses": { "second-wind": 1 } }`: slots per level (index 0 = 1st), feature uses, and `hitDice` spent (one per level, of the class die; an owner spends one from the sheet's sidebar to heal die + Con; a long rest gives back half in 2014, all in 2024).                                                                                                                                                          |
| `exhaustion`    | 1 to 6. 2014: disadvantage on checks, speed halved, disadvantage on attacks and saves, HP max halved, speed 0, dead (cumulative). 2024: −2 per level to d20 tests, −5 ft speed per level, dead at 6. A long rest takes one level away.                                                                                                                                                                                                |
| `inspiration`   | `true` while it holds heroic inspiration: the GM gives it from the sheet, and the one playing it clicks it away when spent.                                                                                                                                                                                                                                                                                                           |
| `summon`        | `{ "by", "spell", "concentration" }`: brought in by a spell; it vanishes when the spell ends.                                                                                                                                                                                                                                                                                                                                         |
| `hotbar`        | How its player arranged the action bar: one entry per slot, `"spell:fire-bolt"`, `"attack:Longsword"`, `"feature:second-wind"`, `"item:potion-of-healing"`, `"scroll:fireball"` or `null`.                                                                                                                                                                                                                                            |
| `animations`    | The animation its controller picked per attack or spell, by `"attack:<name>"` or `"spell:<id>"`: a library name (`"flame-blade"`, `"frost-orb"`, `"lightning"`, `"holy-light"`, `"none"`, see `system-dnd5e/src/animations.ts`) or a video of the assets or a pack (`"pack://jb2a/media/…_30ft_….webm"`). Videos named by range (`_30ft_`) or under a `Ranged` folder fly from the attacker to the target; others play on the target. |
| `leader`        | Token id it acts with: it moves and attacks on its leader's turn instead of having its own (pets, summons).                                                                                                                                                                                                                                                                                                                           |

**Stat blocks.** Besides its numbers and `attacks`, a monster (the SRD's, a
pack's or a token's own) can carry `multiattack` (attacks per action),
`skills` and `expertise` (skill ids it adds its proficiency to, once or
twice), `speeds` (`fly`, `swim`, `climb`, `burrow` in feet, `hover`),
`languages`, `alignment`, `traits` (`{ "name", "description", "kind" }`: text
the GM runs, `kind` `action`, `bonus` or `reaction` when it is not a passive
trait) and `features`: actions the engine runs, written like class features.
A breath weapon is a feature aimed like a spell that recharges on a d6 at the
start of the monster's turn:

```json
{
  "id": "fire-breath",
  "name": "Fire Breath",
  "level": 1,
  "action": "action",
  "uses": [[1, 1]],
  "rechargeOn": 5,
  "spell": {
    "range": 0,
    "area": { "shape": "cone", "size": 60 },
    "save": { "ability": "dex", "dc": 21, "onSave": "half" },
    "damage": [{ "dice": "18d6", "type": "fire" }]
  }
}
```

An attack can carry what rides on its hit in `onHit`: a `save` (`ability`,
`dc`) against extra `damage` (`half`: half of it on a success) or
`conditions` (for `rounds`, with `repeatSave` for a save as each of the
target's turns ends), or conditions with no save that a hit simply leaves, on
creatures up to `maxSize` squares across. A ghoul's claws:

```json
{
  "name": "Claws",
  "kind": "melee",
  "toHit": 4,
  "reach": 5,
  "damage": [{ "dice": "2d4+2", "type": "slashing" }],
  "onHit": {
    "save": { "ability": "con", "dc": 10 },
    "conditions": ["paralyzed"],
    "rounds": 10,
    "repeatSave": true
  }
}
```

A monster that casts spells has `spellcasting`: its `ability`, save `dc` and
spell `attack` bonus (worked out from the ability when missing), caster
`level`, `slots` per spell level and the ids of every spell it can cast in
`spells`. Spells it casts at will or so many times a day are paid by
features with `freeCasts` instead of slots (`uses` for so many a day, none
for at will):

```json
{
  "spellcasting": { "ability": "cha", "dc": 11, "spells": ["dancing-lights", "darkness"] },
  "features": [
    { "id": "at-will", "name": "Spells at will", "level": 1, "freeCasts": [{ "spell": "dancing-lights" }] },
    {
      "id": "daily-darkness",
      "name": "Darkness (1/Day)",
      "level": 1,
      "uses": [[1, 1]],
      "freeCasts": [{ "spell": "darkness" }]
    }
  ]
}
```

Leave `rechargeOn` out and set `uses` to `[[1, 3]]` for "3/Day". SRD monsters
come with all of this.

**Legendary creatures.** A monster's stat block can carry `legendary`
(`{ "actions": 3, "options": [{ "id", "name", "cost"?, "attack"?, "description"? }] }`),
`legendaryResistance` (uses per day) and `lair`
(`{ "actions": [{ "id", "name", "description"? }] }`); any creature can be
given the same fields in its `stats`, which win over the stat block. The SRD
monsters bring their legendary actions and resistance; the SRD has no lair
actions, so lairs are yours to write. The GM spends legendary actions from
the sheet's Features page at the end of another creature's turn (an option
with `attack` strikes the one targeted creature); the pool comes back at the
start of the creature's turn. Legendary resistance turns a failed save into
a success by itself and comes back on a long rest. A creature with a `lair`
gives the fight a Lair turn on initiative 20 (losing ties), when the GM takes
one lair action. Uses are kept in `spent.uses` (`legendary`,
`legendary-resistance`).

Effect modifiers: `senses` (e.g. `{ "darkvision": 60 }` or
`{ "seeInvisible": true }`), `conditions` (e.g. `["prone"]`, `["paralyzed"]`),
`attackBonus` and `saveBonus` (dice like `"1d4"` or `"-1d4"`), `ac`, `speed`,
`resistances`, `advantage`, `disadvantage`, `advantageAgainst`,
`disadvantageAgainst`, `meleeDamage`, `saveAdvantage`, `immobile` (speed 0),
`hitDamage` (added to the bearer's weapon hits, e.g. divine favor), `markDamage`
(added when `onlyFor` hits the bearer, e.g. hunter's mark; a damage `type` of
`"weapon"` takes the attack's type), `weaponBonus` (magic weapon),
`zone: { "spell", "slot", "at"?, "spares"? }` (a lasting area like spirit
guardians: creatures starting their turn in it or walking in are hit),
`repeat: { "spell", "slot" }` (the spell can be used again without a slot,
like spiritual weapon), `armorBase` (unarmored AC is this + dex, mage armor),
`minAc` (barkskin), `maxHp` (aid), `turnTempHp` (temporary hit points at the
start of each of the bearer's turns, heroism), `speedTimes` (speed multiplier:
2 for haste, 0.5 for slow), `turnAttacks` (extra attacks each turn, haste). Lifetime: `rounds`
counts down at the start of the `source` creature's turn; `once` ends it the
first time it changes an attack; `repeatSave` with `save: { "ability", "dc" }`
lets the bearer save again at the end of each of its turns; `endsOnAttack`
ends it when the bearer attacks or casts; `endsOnDamage` ends it when the bearer
takes damage, and `saveOnDamage` gives it another save (with advantage) then;
`worsens` (with `repeatSave`) swaps the conditions for these on a failed save. A hidden trap or a GM ruling can
just write an effect into the token.

`changes` changes any statistic by key, like Foundry's Active Effects (and
DAE): `[{ "key": "abilities.str", "mode": "override", "value": 19 }]`. Keys:
`abilities.<str…cha>` and `proficiency` (changed first, so attacks, saves and
AC follow), `ac`, `maxHp`, `speed`, `initiative`, `toHit` (every attack roll),
`saves.all`, `saves.<str…cha>`, and `resistances`, `immunities`,
`vulnerabilities` (the value is a damage type, added to the list). `mode` is
`add` (the default), `multiply`, `downgrade` (at most), `upgrade` (at least)
or `override`; they apply in that order. A feature's `passive` effect takes
`changes` too (a belt of giant strength as a homemade feature). In the sheet's
edit mode, the Effects page makes and edits effects with changes by hand.

A change's `value` can also be an ability of the effect's source, as DAE
writes it: `"@cha"` (its Charisma modifier) or `"max(1,@cha)"` (at least 1).
Auras fill it in; on other effects it counts for nothing.

**Auras**, like Active Auras: an effect with
`"aura": { "radius": 10, "who": "allies", "self": true, "conscious": true }`
doesn't act on its bearer. Instead, every creature within `radius` feet that
`who` names (`allies`, the default, then `enemies` or `all`) gets a copy of
it, the bearer too unless `self` is false (or `who` is `enemies`). The copy
goes when the creature leaves the aura's reach, or when the bearer drops
(unless `conscious` is false). The server keeps the copies on the tokens
(marked `auraFrom`, in the same undo step as the move), so leave those
copies alone. A paladin's Aura of Protection (+Charisma to saves) and Aura of
Courage (`conditionImmunities: ["frightened"]`, which keeps a condition off the
bearer while it lasts) work this way, reaching 30 ft at 18th level (`auraRadius`
on the feature). In the sheet's Effects page, the effect form sets an aura's
radius and whom it reaches.

Players only receive the stats of tokens they control. For everyone else
they're told how hurt the creature looks (unhurt, hurt, bloodied, down).

## The Actors list

`actors/` doubles as the GM's Actors list, grouped in folders. Creatures for
later (an ambush, reinforcements) are actors with no token yet:

```json
{ "id": "bandit", "name": "Bandit", "folder": "road", "monster": "bandit" }
```

with `folders/road.json` being `{ "id": "road", "name": "Road", "kind": "actors" }`.

Dragging one onto the map adds a token for it to the scene's `tokens.json`
with a free id (`bandit`, `bandit-2`, ...). Placing an SRD monster from the
Compendium uses its stock actor in the Monsters folder, made the first time.
The GM can also save a token without an actor as a new actor.

## Folders

The sidebar lists (actors, scenes, journal entries, roll tables, playlists,
macros, cards) keep their documents in folders, as Foundry does. A folder is
a file in `folders/` (schema in `shared/folders.ts`):

```json
{ "id": "road", "name": "Road", "kind": "actors", "parent": "npcs", "color": "#7f1d1d" }
```

| Field    | What it is                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `kind`   | The list it is in, by the folder its documents are in: `actors`, `scenes`, `journals`, `tables`, `playlists`, `macros`, `cards`. |
| `parent` | The folder it sits in (of the same list); missing = the top of the list.                                                         |
| `color`  | Its colour in the list, `#rrggbb`.                                                                                               |
| `sort`   | Its place among its siblings (a fractional key); missing sorts first.                                                            |

A document names its folder by id in `folder` (a scene in its `scene.json`).
`check-game` flags a `folder` or `parent` that isn't in `folders/`, or is a
folder of another list. Deleting a folder moves what was in it up to its
parent. Players see a folder only when something in it, or in a folder
below it, is theirs to see.

## combat.json

Written by the server while a fight is on, deleted when it ends. You can write
it to set up an encounter that starts mid-fight:

```json
{
  "round": 1,
  "turn": 0,
  "order": [
    { "token": "goblin-1", "initiative": 17 },
    { "token": "bram", "initiative": 12 }
  ],
  "left": { "move": 30, "action": true, "bonus": true, "attacks": 0, "used": [] },
  "side": {}
}
```

`turn` is the index in `order` of the creature acting now; `left` is what it
has left this turn (feet of movement, action, bonus action, attacks left in an
Attack action, once-per-turn things already used like sneak attack). `side`
holds the same for creatures acting on this turn through `leader`, by id.

## time.json

The game clock. The server makes it the first time it starts a game; the GM
runs it from the date in the top bar.

```json
{
  "time": 1209600,
  "running": false,
  "speed": 1,
  "calendar": {
    "months": [
      { "name": "Deepwinter", "days": 30 },
      { "name": "Thaw", "days": 30 }
    ],
    "weekdays": ["Moonday", "Fireday", "Restday"],
    "epochYear": 1492,
    "era": "AR",
    "sunrise": 6,
    "sunset": 18,
    "twilight": 1,
    "night": 1
  }
}
```

`time` is game seconds since the first day of `epochYear`. Every calendar field
has a default: twelve months of a 365-day year, Monday to Sunday, sunrise at 6
and sunset at 18, with dawn and dusk lasting `twilight` hours around them, and
`night` the darkness at night on scenes with `darknessFollowsClock`. While the
clock runs, `since` is the server time (ms) it runs from and `time` is the game
time at that moment; `speed` is game seconds per real second.

In a fight, and in turn-based mode outside one (the GM's "Turn-based" button:
the party takes turns), the clock holds still and each round adds 6 seconds;
`round` is the fight round it last counted. A short rest lets 1 hour pass, a
long rest 8. Only one long rest in 24 hours does a creature good: it keeps
`longRestAt`, the clock second its last one ended, and the GM's long rest
leaves out anyone whose last one ended less than a day before this one would
(and refuses, letting no time pass, when that is everyone). Everything that lasts has its end on the clock: effects
(`endsAt`), concentration and summons (`concentration.endsAt`,
`summon.endsAt`), templates, and lights with `lasts` (placed ones and the
light a token carries: a lit torch burns for an hour, a lantern for 6). Gear
with `"use": { "light": {…}, "fuel": "oil-flask" }` is lit from the action bar:
the token carries that light, and the torch (or the fuel) is used up. An effect
with `light` (the Light spell) makes its bearer shine while it lasts. Skipping
time ends them; in a fight, effects that
last rounds count down on their maker's turns instead. Every change to the
clock, and what it ended, can be undone.

## Moving from the old world layout

Before storage v2 a world was `world.json`, `chunks/<cx>_<cy>.json` and one
file per token in `tokens/`. The server moves such a folder to this layout
when it starts (or run `pnpm migrate-world [folder]`): `world.json` becomes
`game.json` plus `scenes/main/scene.json`, every chunk's tiles, walls and
lights go into the scene's lists, and the token files into `tokens.json`.
Ids two chunks shared get a number (`grass`, `grass-2`). The old files are
copied to `.v1-backup/<time>/` first and nothing is deleted from there. A
broken old file stops the move before anything changes, and old files that
turn up next to a moved game (a token file restored from git, say) are
added to its active scene the next time the server starts.

## Format 3: actors split from tokens

Before format 3 every token in `tokens.json` carried its whole sheet. The
server moves such a folder up when it starts (or run `pnpm migrate-world`):
a character or other one-of-a-kind creature gets an actor of the same id and
a linked token; monsters become unlinked tokens of one actor per monster
(`goblin`, reusing an Actors-list actor of the same monster), keeping what
was their own in `delta`. Each moved token is exactly the creature it was.
Summons and tokens that already have an actor are left as they are. The
scenes, actors and `game.json` are copied to `.v2-backup/<time>/` first, and
`game.json` gets `"format": 3` last.

## Format 4: ownership levels

Before format 4 a creature listed its owners in `controllers` and its
watchers in `observers`. The server turns them into `ownership` when it
starts (or run `pnpm migrate-world`): `{ "controllers": ["ana"],
"observers": ["bo"] }` becomes `{ "ownership": { "default": "limited",
"ana": "owner", "bo": "observer" } }`, in actors, tokens and unlinked
tokens' `delta`. The scenes, actors and `game.json` are copied to
`.v3-backup/<time>/` first, and `game.json` gets `"format": 4` last.

## Format 5: folder documents

Before format 5 a document's `folder` was a name, with `" / "` between the
names of folders inside each other (`"Monsters / Goblins"`). The server
makes a folder in `folders/` for each name, per list and nested as the
names were, and puts its id in `folder` (or run `pnpm migrate-world`). What
it changes is copied to `.v4-backup/<time>/` first, and `game.json` gets
`"format": 5` last.
