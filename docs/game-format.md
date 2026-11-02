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
- Scenes have no grid unless `grid` is `"square"`. Without one, tokens walk
  to any point, around walls and around other creatures (no one walks
  through or stops inside another), and distances are plain feet as the
  crow flies. Creatures within half a square of each other's edge count as
  5 ft apart, so melee works without lining tokens up.
- With `"grid": "square"` the square at column `c`, row `r` spans
  `c*gridSize` to `(c+1)*gridSize`, its centre is `(c + 0.5) * gridSize`,
  and tokens walk square centre to square centre (with `gridSize: 100` a
  token sits at `x: 550`, not `x: 500`), every square 5 ft, diagonals too.
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
Changes reach everyone live: whoever's seat, scene or settings changed starts
over on their scene; a seat that's gone is disconnected.

Players whose `id` matches an account (see the README) are that account's
seat: the game's members are its seats (see `docs/lobby.md`). The server adds
one when an account joins, so you can change its `role` here afterwards.
Removing a seat deletes its explored fog. A character brought from an account becomes an actor
and a linked token, both with the character's id and the account as
`owner` in `ownership`; saving or levelling the character updates its name, stats and
senses.

`format` is the folder's format; the server sets it when it moves an older
folder up (see the end of this page). Leave it as it is.

Roles, like Foundry's user roles (the GM changes them in the Players tab):

| Role       | What the seat may do                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| `gm`       | Everything.                                                                            |
| `trusted`  | Play the tokens they own, and edit their sheets (not ownership, position or `hidden`). |
| `player`   | Play the tokens they own.                                                              |
| `observer` | Watch through the party's eyes and read their sheets; act on nothing.                  |

## scene.json

```json
{ "name": "Crossroads", "gridSize": 100, "start": [1000, 900], "darkness": 0.85 }
```

`start` is where the camera opens, and where characters joining from an
account appear. `darkness` (0 to 1, default 0) is the time of day: up to 0.3
is daylight, up to 0.6 is dim light (dusk, moonlight) and above that is
darkness, where only lights and senses like darkvision show anything.
`vision` (default `true`) is fog of war: players see only what their tokens
can. `chunkSize` (default 2000, a multiple of `gridSize`) is how big the
pieces are that the server streams to each camera; it has nothing to do with
how the scene is stored.

Optional, all set from the Scenes tab too:

| Field                  | What it does                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `name`                 | What the Scenes list and the top bar show (the folder name otherwise).                    |
| `sort`                 | Order in the Scenes list (a sort key, see `sort-key.ts`); the editor writes it.           |
| `exploration`          | With fog of war, players keep seeing (dimmed) where they have been. Default on.           |
| `grid`                 | `"none"` (default): no grid, free movement in feet. `"square"`: grid lines, square moves. |
| `gridColor`            | Grid line colour, default `"#000000"`.                                                    |
| `gridOpacity`          | 0 to 1, default 0.16.                                                                     |
| `background`           | What shows where nothing is drawn, e.g. `"#1b1d22"`.                                      |
| `darknessFollowsClock` | The darkness follows the game clock's time of day (see time.json); `darkness` is ignored. |
| `levels`               | Floors of the scene, see "Scene levels" below.                                            |
| `playlist`             | A playlist id: it starts (and the one playing stops) when the game moves here.            |

Every scene is live at once: the rules (moves, doors, fights, spells) work
on whichever scene the player acting is on.

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

  ```json
  { "id": "hedge", "a": [0, 0], "b": [500, 0], "sight": "limited", "light": "limited", "sound": "limited" }
  ```

- Ids must be unique within the list.

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

| Field       | Meaning                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| `color`     | Colour of the light; default a warm white.                                       |
| `animation` | `"flicker"` for flames, `"pulse"` for magic.                                     |
| `darkness`  | Magical darkness (the Darkness spell) of radius `bright + dim` instead of light. |

The GM can also draw walls, doors and windows, place, drag and erase lights,
and set the time of day from the map tools in the game (bottom left).

Walls stop light like they stop sight. A token carries a light with the same
fields in `light`. A placed light with `activeAt: [from, to]` shines only
while the darkness is in that band (`[0.6, 1]` lamps lit at night; a band
written high to low wraps round, `[0.8, 0.2]` dusk to dawn). Everything with
`activeAt` reads it through `activeAt()` in `shared/levels.ts`, the one place
time of day is read, so world time (step 13) changes it in one spot. Magical darkness puts out every other light, and only
devil's sight, truesight, blindsight and tremorsense work inside it.

## Scene levels

A scene can have floors, like Foundry's Levels module. `levels` in
`scene.json` names them by the elevation (feet) where each starts:

```json
"levels": [{ "id": "ground", "name": "Ground", "bottom": 0 }, { "id": "loft", "name": "Loft", "bottom": 10 }]
```

A token is on the highest level its `elevation` (feet, default 0) reaches.
Tiles, walls, lights, drawings, notes, templates, regions and sounds take a
`level`; without one they are on every level. A token sees, and is lit and
blocked by, only what is on its own level, and players don't see creatures
on another floor (`tokensVisibleTo` in `shared/permissions.ts`, the fog
keeper on the server, `Vision` on the client). The GM picks the floor shown
in the map tools; a player sees their token's. A region with a `level`
behaviour moves a token between floors (stairs, a ladder).

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

| Behaviour                                                           | What it does                                                                                                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ "type": "difficult", "multiplier": 2 }`                          | Moving through costs that many times as much (paths go round it if they can).                                                                                     |
| `{ "type": "trap", "message": "…", "once": true, "system": { … } }` | The game system springs it; D&D: `system` is `{ "save": "dex", "dc": 15, "damage": "2d6", "type": "piercing", "half": true }`. `once` turns the region off after. |
| `{ "type": "teleport", "to": [x, y], "scene": "cellar" }`           | Moves the token there (and, to another scene, the players who own it).                                                                                            |
| `{ "type": "level", "to": "loft" }`                                 | Takes the token to that level (its elevation becomes the level's bottom).                                                                                         |
| `{ "type": "reveal" }`                                              | The players whose token walked in see the whole region as explored.                                                                                               |
| `{ "type": "message", "text": "…", "gmOnly": true }`                | Says it in chat (to the GM alone with `gmOnly`).                                                                                                                  |

**Sounds** (`sounds.json`): `x, y`, `radius` (feet), `src`, `volume` (0
to 1, default 0.5), `walls` (default true: each wall between muffles it),
`activeAt`, `name`. A player hears them from their token, the GM from the
middle of the screen.

## Journal entries, roll tables and playlists

One file each, in `journals/`, `tables/` and `playlists/` (schemas in
`shared/journals.ts`). Each has `id`, `name`, and may have `folder`, `sort`
and `ownership` (missing: only the GM sees it; `limited` shows the title,
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

A roll table has `results` (`text`, `weight` default 1, `drawn`), and
`replacement: false` draws each result once until it is reset. A playlist
has `mode` (`"sequence"`, `"shuffle"`, `"together"`), `volume`, and
`tracks` (`id`, `name`, `src`, `volume`, `repeat`, `playing`); players are
sent the playlists that are playing, and the GM's client moves on to the
next track when one ends.

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
`visibleTo`, `summon` and `leader` belong to the token itself; everything
else on a token with an actor goes in `delta`, and `check-game` says so.

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

| Field         | Meaning                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `id`          | Lowercase letters, digits, dashes. An actor's must match its file name. |
| `x`, `y`      | A token's centre in pixels (a square centre on a square grid).          |
| `size`        | In squares: 1 medium, 2 large, 3 huge. Default 1.                       |
| `color`       | Disc colour behind the placeholder when there is no picture.            |
| `img`         | Picture URL, drawn as-is: use a top-down cut-out with transparency.     |
| `speed`       | Walking speed in feet. Default 30.                                      |
| `ownership`   | Who may see, read and act with it; see Ownership below.                 |
| `darkvision`  | Range in feet. Also `blindsight`, `tremorsense`, `truesight`.           |
| `devilsSight` | Sees in magical and nonmagical darkness to this range, in feet.         |
| `light`       | A light it carries, like a placed light: `{ "bright": 20, "dim": 20 }`. |
| `hidden`      | A token's: `true` = only the GM sees it.                                |
| `visibleTo`   | A token's: only these players (and the GM) see it. Used for illusions.  |
| `folder`      | An actor's: groups it in the Actors list.                               |

### Ownership

`ownership` gives each player a level, like Foundry's, and `default` is the
level of everyone not named:

| Level      | The player                                                        |
| ---------- | ----------------------------------------------------------------- |
| `none`     | doesn't know it is there: not sent to them at all.                |
| `limited`  | sees it on the map but not its sheet, only how hurt it looks.     |
| `observer` | reads its sheet and sees through its eyes.                        |
| `owner`    | moves and acts with it; a `trusted` seat may also edit its sheet. |

A creature without `ownership` is `limited` for everyone. The GM is owner of
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
| `abilities`                                    | `str dex con int wis cha` scores; missing ones are 10 (or the monster's).                                                                            |
| `maxHp`                                        | Hit point maximum.                                                                                                                                   |
| `ac`, `proficiency`                            | Override the computed values.                                                                                                                        |
| `attacks`                                      | Extra attacks: `{ "name", "kind": "melee"\|"ranged", "toHit", "reach" or "range": [normal, long], "damage": [{ "dice": "1d6+2", "type": "fire" }] }` |
| `resistances`, `immunities`, `vulnerabilities` | Damage types, e.g. `["fire"]`.                                                                                                                       |

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

**Spells and features.** `stats.spells` lists the spell ids a character
knows or has prepared (from `spells-5.1.json` or `spells-5.2.json`, by the
token's edition). A `class` named after an SRD class (Wizard, Fighter, ...)
gives that class's spell slots, spellcasting ability and features by `level`,
from `classes-5.x.json`. A homebrew class or a monster that casts uses
`"spellcasting": { "ability": "int", "progression": "full" | "half" | "pact", "level": 5 }`.

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
adds one). A spell scroll is an inventory entry with the spell on it:
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

The server writes the rest of a creature's magic to its token, and you can
edit it too:

| Token field     | Meaning                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `effects`       | What is affecting it now: `[{ "id", "name", "rounds"?, "source"?, "concentration"?, ...modifiers }]`.                                                                                      |
| `deathSaves`    | `{ "successes", "failures", "stable"?, "dead"? }`: a character at 0 hp rolls these at the start of its turns. Monsters just die at 0.                                                      |
| `concentration` | `{ "spell", "name" }`: the spell it concentrates on. Ending it ends that spell's effects and summons.                                                                                      |
| `spent`         | `{ "slots": [1, 0], "uses": { "second-wind": 1 } }`: slots per level (index 0 = 1st) and feature uses.                                                                                     |
| `summon`        | `{ "by", "spell", "concentration" }`: brought in by a spell; it vanishes when the spell ends.                                                                                              |
| `hotbar`        | How its player arranged the action bar: one entry per slot, `"spell:fire-bolt"`, `"attack:Longsword"`, `"feature:second-wind"`, `"item:potion-of-healing"`, `"scroll:fireball"` or `null`. |
| `leader`        | Token id it acts with: it moves and attacks on its leader's turn instead of having its own (pets, summons).                                                                                |

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

Players only receive the stats of tokens they control. For everyone else
they're told how hurt the creature looks (unhurt, hurt, bloodied, down).

## The Actors list

`actors/` doubles as the GM's Actors list, grouped by `folder`. Creatures for
later (an ambush, reinforcements) are actors with no token yet:

```json
{ "id": "bandit", "name": "Bandit", "folder": "Road", "monster": "bandit" }
```

Dragging one onto the map adds a token for it to the scene's `tokens.json`
with a free id (`bandit`, `bandit-2`, ...). Placing an SRD monster from the
Compendium uses its stock actor in the Monsters folder, made the first time.
The GM can also save a token without an actor as a new actor.

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
long rest 8. Everything that lasts has its end on the clock: effects
(`endsAt`), concentration and summons (`concentration.endsAt`,
`summon.endsAt`), templates. Skipping time ends them; in a fight, effects that
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
