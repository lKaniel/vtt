# The map editor

One editor drives every kind of thing on the map. Pick a mode, and the same
clicks, drags, keys and menus work on whatever that mode owns. The GM has
every mode; players stay on Tokens.

## Modes and tools

| Mode   | Key     | Tools                      | Handles                        |
| ------ | ------- | -------------------------- | ------------------------------ |
| Tokens | T       | select                     | none (drag a token to walk it) |
| Tiles  | Shift+T | select                     | 8 resize handles               |
| Walls  | W       | select, wall, door, window | both ends                      |
| Lights | L       | select, place              | bright ring, dim ring          |

The buttons are bottom left (`ui/MapTools.tsx`). Outside the tokens mode,
tokens and door handles don't take clicks.

## Pointer

- Click selects the topmost thing under the pointer; empty space deselects.
- Left-drag on empty space draws a marquee: it selects everything it
  touches, or with Alt only what it holds whole. Shift adds, Ctrl removes.
- Shift+click adds or removes one thing; Ctrl+click removes it.
- Dragging something moves the selection (dragging something not selected
  selects it first, as in Figma). Dragging a handle reshapes.
- Moves snap to whole squares (lights to half squares), wall ends to
  corners, light rings to 5 ft and tile edges to the grid. Shift turns
  snapping off.
- Right click opens the menu of what is under the pointer (selecting it if
  it wasn't), or of the ground. Right or middle drag pans and opens nothing.
  A right click also puts away a half-drawn wall, an aimed spell or a
  readied attack.
- Tokens: click selects the token you act with; drag walks it (and the rest
  of the selection, by the same offset) by the rules. Clicking empty ground
  deselects, so walking is by dragging, or "Move … here" in the ground menu.

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

- `shared/hit-test.ts`: shapes (circle, segment, rect), picking and
  marquees. Geometry lives here and in `geometry.ts`, so a faster
  implementation (Rust/WASM, a spatial index) can replace this one module.
- `shared/placeables.ts`: per type, its shape, handles, what dragging a
  handle does, and moves (through `EDIT_KINDS`, as paste uses).
- `client/editor/controller.ts`: the gestures, with no Pixi in it: press,
  click, marquee, move, handle drag. `selection.ts` has the modifier rules.
- `client/session-editor.ts`: mode, tool, selection and menu state; every
  change goes out as an `ops` transaction, shown at once and taken back if
  the server refuses it (`sendUpdates` in `session-edits.ts`).
- `client/canvas/MapEditor.ts`: says what is where for the controller and
  draws walls, lights, the selection, handles and the marquee.
- `client/editor/menus.ts`: the menu registry. A new type (or a game system)
  calls `registerMenu(type, source)`; `'ground'` is the menu on empty
  ground and `'selection'` adds to every selection.

## Adding a placeable type

1. Its schema and collection (see `game-format.md`), and an `EDIT_KINDS`
   entry with a sample in `server/src/edit-commands.test.ts`.
2. A shape, handles and handle drags in `placeables.ts`, and a mode in
   `MODES`.
3. Fields in `editor/inspector.ts` and menu entries with `registerMenu`.
