# The map editor

One editor drives every kind of thing on the map. Pick a mode, and the same
clicks, drags, keys and menus work on whatever that mode owns. The GM has
every mode; players have Tokens, Draw and Measure, and change only what
they drew.

## Modes and tools

| Mode    | Key      | Tools                                               | Handles                                                                                    |
| ------- | -------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Tokens  | T        | select                                              | none (drag a token to walk it)                                                             |
| Tiles   | Shift+T  | select, draw                                        | 8 resize handles                                                                           |
| Walls   | W        | select, wall, door, window                          | both ends                                                                                  |
| Lights  | L        | select, place                                       | bright ring, dim ring                                                                      |
| Draw    | D        | select, box, ellipse, polygon, line, freehand, text | box: 8; polygon and line: each point, and the middle of each side (drag it to add a point) |
| Notes   | N        | select, pin                                         | none                                                                                       |
| Measure | M, R     | select, ruler, circle, cone, line, square           | the aim (length and direction, 5 ft and 15° steps)                                         |
| Regions | (button) | select, region                                      | each corner, the middle of each side                                                       |
| Sounds  | (button) | select, place                                       | the reach                                                                                  |

The buttons are bottom left (`ui/MapTools.tsx`). Outside the tokens mode,
tokens and door handles don't take clicks. The shape tools are a small state
machine in `editor/shape-tools.ts`: drag a box; click point by point for
polygons, lines and regions (click the first point, or right click, to
finish); drag freehand; click to put a note or sound down; drag a template
out from its origin. Shift turns snapping off. In the Draw mode the toolbar
also picks the line colour, width and fill of new drawings; the GM's
toolbar has the level picker on scenes with floors. A click on a note in
the tokens mode opens its journal entry.

The ruler (R picks it up) measures without placing anything: click to start
(on a creature, from its centre), click for each waypoint, right click takes
the last one back and Esc puts it away. Everyone on the scene sees it live,
in its player's colour, with the feet so far at each waypoint and at the end
the total, what walking it costs across difficult ground, and, from a
creature, its speed (or what is left of its turn). The measuring is
`measureRuler` in `shared/ruler.ts` (crow-flies without a grid, 5 ft a square
on one, regions' difficult ground from `regionCost`); the client keeps
rulers in `rulers.ts` and draws them in `canvas/RulerLayer.ts`, and the
server only passes them on (`server/presence.ts`): they aren't documents, so
nothing is saved or undone.

Everyone on a scene also sees where the others point: each player's cursor,
with their name, in their colour. Hold a left press still for half a second,
in any mode, to ping that spot: rings spread from it on everyone's map. The
GM's Shift+long press also pulls everyone's view there. Cursors and pings go
through `server/presence.ts` like rulers (live, per scene, never saved, a
cursor goes when its player leaves the map or the scene); the client keeps
them in `presence.ts` (cursors sent at most every 50 ms, `throttle.ts`) and
draws them in `canvas/PresenceLayer.ts`.

## Pointer

- Click selects the topmost thing under the pointer; empty space deselects.
- Left-drag on empty space draws a marquee: it selects everything it
  touches, or with Alt only what it holds whole. Shift adds, Ctrl removes.
- Shift+click adds or removes one thing; Ctrl+click removes it.
- Dragging something moves the selection (dragging something not selected
  selects it first, as in Figma). Dragging a handle reshapes.
- Moves snap to whole squares (lights to half squares), wall ends to
  corners, light rings to 5 ft and tile edges to the grid. Shift turns
  snapping off. Tokens on a scene without a grid never snap.
- Right click opens the menu of what is under the pointer (selecting it if
  it wasn't), or of the ground. Right or middle drag pans and opens nothing.
  A right click also puts away a half-drawn wall, an aimed spell or a
  readied attack.
- Tokens: click selects the token you act with; drag walks it (and the rest
  of the selection, by the same offset) by the rules. Clicking empty ground
  deselects, so walking is by dragging, or "Move … here" in the ground menu.

## Scenes

The Scenes tab in the GM's side panel (`ui/ScenesTab.tsx`) lists the game's
scenes with who is on each. View looks at a scene, and edits it, without
moving anyone; Play here moves the game there with every seat; Send… puts
one player on a scene of their own. Add, Copy (everything on it, token ids
made new) and Delete (with everything on it) are document ops
(`shared/scenes.ts`), so Ctrl+Z undoes them; the server deletes what is on
a deleted scene in the same step (`server/scene-ops.ts`) and won't delete
the scene the game is on. Settings: name, grid (none, the default, or squares; pixels per 5 ft,
colour, opacity), darkness, background, fog of war, remembering explored
ground. Scenes aren't in `EDIT_KINDS`: a scene isn't a placeable, and the
list's buttons build their own ops.

## Fog of war

The GM's Fog row (bottom left, on scenes with fog of war) has Reveal and
Hide brushes, a brush size, whose fog (all players or one) and Reset. With
a brush on, the map shows what those players explored (unexplored ground
darkened) and tokens don't take clicks; drag to paint. A stroke is sent
when you let go, as one edit (`fog` message), so one Ctrl+Z takes it back
without losing what players explored since. Players' explored ground comes
from the server (`canvas/lighting/FogLayer.ts`).

## Tiles: layers and groups

Tiles work like Figma's layers (rules in `shared/tiles.ts`, format in
`game-format.md`):

- A click on a tile in a group selects the group; a double click selects the
  tile (or inner group) under the pointer, and clicks then pick among its
  siblings until you click something outside.
- Moving a group or a container tile moves what is in it. A tile dropped onto
  another (its middle over it) goes inside it, on top; dragged off its
  container it leaves it. Tiles in a group stay in the group.
- Resizing a group scales what is in it; resizing a container doesn't.
- Ground (`background`) never takes tiles in, and a drag that starts on ground
  that isn't selected draws a marquee; a marquee takes ground only when it
  holds it whole (Alt).
- Locked tiles (and what is in them) let clicks and marquees through.
- The Draw tool drags out a rect tile of the preset picked under it: ground
  presets go under everything, the rest into the container under them.
- The layers panel (under the tools) lists the topmost first. Click selects
  (Shift adds, Ctrl removes), a double click renames, the lock button locks.
  Drag a row onto the top or bottom edge of another to put it above or below,
  or onto its middle to put it inside.
- Group Ctrl+G, ungroup Ctrl+Shift+G, bring forward Ctrl+], send backward
  Ctrl+[, to the front or back with Shift, lock Ctrl+Shift+L. The tile menu
  has these too, and "Make it ground".
- Every drawn tile reaches players with `z`, its place in the scene's draw
  order, so tiles in different chunks stack right.

## Keys

Delete or Backspace deletes, Ctrl+C/X/V copy, cut and paste, Ctrl+D
duplicates, Ctrl+A selects all in the mode, Ctrl+Z and Ctrl+Shift+Z (Ctrl+Y)
undo and redo. Arrows nudge a pixel, Shift+arrows a square (in the tokens
mode the arrows walk a square). Esc closes the menu, then goes back to the
select tool, then deselects, then returns to Tokens.

## Inspector

Bottom right: the fields of the selection (`editor/inspector.ts`). A field
that differs across the selection shows "Mixed"; setting it sets it on all of
them, as one undo step.

## How it fits together

- `shared/hit-test.ts`: shapes (circle, segment, rect, polygon, path), picking and
  marquees. Geometry lives here and in `geometry.ts`, so a faster
  implementation (Rust/WASM, a spatial index) can replace this one module.
- `shared/placeables.ts`: per type, its shape, handles, what dragging a
  handle does, and moves (through `EDIT_KINDS`, as paste uses); drawings,
  notes, templates, regions and sounds in `item-shapes.ts`, box handles in
  `box-handles.ts`.
- `client/editor/controller.ts`: the gestures, with no Pixi in it: press,
  click, marquee, move, handle drag. `selection.ts` has the modifier rules.
- `client/session-editor.ts`: mode, tool, selection and menu state; every
  change goes out as an `ops` transaction, shown at once and taken back if
  the server refuses it (`sendUpdates` in `session-edits.ts`).
- `client/canvas/MapEditor.ts`: says what is where for the controller and
  draws walls, lights, the selection, handles and the marquee.
  `ItemLayer.ts` draws drawings, templates, notes and regions for everyone
  (`item-draw.ts`), under the fog.
- `client/editor/menus.ts`: the menu registry. A new type (or a game system)
  calls `registerMenu(type, source)`; `'ground'` is the menu on empty
  ground and `'selection'` adds to every selection.

## Adding a placeable type

1. Its schema and collection (see `game-format.md`), and an `EDIT_KINDS`
   entry with a sample in `server/src/edit-commands.test.ts`.
2. A shape, handles and handle drags in `placeables.ts`, and a mode in
   `MODES`.
3. Fields in `editor/inspector.ts` (or `item-fields.ts`) and menu entries
   with `registerMenu`.
