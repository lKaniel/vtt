# The Claude bridge (MCP)

A running server answers the [Model Context Protocol](https://modelcontextprotocol.io)
at `POST /mcp`, so Claude Code or Claude Desktop can sit at a live game:
look at the table, read the chat, move tokens, roll, and build scenes by
editing documents while everyone watches.

## Connecting

1. Join the game, sit at the table and press **Connect Claude** (the robot
   in the top bar), then
   **Make a key**. The key is shown once; a new one replaces it. Claude plays
   as the player you joined as, at that game.
2. Paste the command it shows into a terminal:

   ```sh
   claude mcp add --transport http vtt http://localhost:3001/mcp \
     --header "Authorization: Bearer vtt_..."
   ```

A server can also set `VTT_MCP_KEY=<secret>`: that key sits as the home
game's GM.

## What Claude may do

Claude acts as a seat with no browser (`server/mcp-seat.ts`): it joins the
game as your player, sends the same messages a browser would, and leaves.
So it has exactly your rights. As a player it sees what you see. As the GM it
can do anything the GM can, and every change is one undo step under your
name.

## Tools

| Tool                             | What it does                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `guide`                          | The game format (docs/game-format.md), to read first                                 |
| `list_games`                     | Your games and your role in each                                                     |
| `look`                           | Scene, tokens (pixels, HP for those you may see), combat, players, document counts   |
| `read_chat`                      | The last chat messages and roll cards                                                |
| `list_documents`, `get_document` | Read any document you may read (`actors`, `journals`, `<scene>/walls`...)            |
| `edit_documents`                 | Create, update or delete documents, all or nothing, as one undo step                 |
| `say`                            | Chat as you, including `/r` rolls                                                    |
| `move_token`                     | Walk a token to a point                                                              |
| `override_turn`                  | GM or trusted: set a turn's action, bonus action, reaction, movement, extra actions  |
| `undo`                           | Undo your last step                                                                  |
| `send`                           | Any other message a browser sends (start combat, run a macro...)                     |
| `create_scene`                   | A new scene, with a ground tile of a given size                                      |
| `build_scene`                    | Rooms, walls, doors, lights, floors, creatures, regions... from a blueprint          |
| `describe_scene`                 | A scene's settings and every item on it, by collection                               |
| `render_scene`                   | A top-down picture of a scene (or part of it), with a legend                         |
| `clear_area`                     | Deletes what lies inside a box                                                       |
| `go_to_scene`                    | Takes your view, or the whole game, to a scene                                       |
| `list_assets`                    | The pictures, sounds, videos and 3D models the game may use                          |
| `find_assets`                    | Map pieces from the asset catalogs of the game's packs, by words, with sizes in feet |

## Building scenes

Ask Claude for a scene ("a ruined chapel with a crypt below, four skeletons
and a locked vault") and it builds it with the scene tools, all as the GM:

1. `create_scene` makes the scene: name, size in squares, grid, ground
   texture, darkness.
2. `build_scene` takes a blueprint, in squares unless `units` is `pixels`:
   - `rooms`: boxes `x, y, w, h` with a `floor` (a ground texture or a
     colour), a `light` preset and `doors` (`side` n/s/e/w, `at` squares from
     the side's west or north end, `width`, `kind`: door, open, locked,
     secret, window, arch, terrain...). Where rooms touch, the wall between
     them is made once and the doors of both are cut into it.
   - `walls`: paths of `points` (`closed` to go round), with a `kind`.
   - `lights` (presets torch, candle, campfire, lamp, lantern, magic,
     darkness, or your own `bright`, `dim`, `color`...), `tiles` (painted
     ground, or pictures with `src`), `regions` (box or points, with
     behaviours: traps, difficult ground, teleports, stairs), `sounds`, `notes`.
   - `tokens`: an SRD `monster` or an `actor`, a `count`, `hidden`; placed
     like the GM's drag from the Compendium (numbered names, stock actors).

   Points (lights, creatures) sit on the centre of square `x, y`; walls and
   boxes run along the grid lines. Any other field goes into the document as
   it is (`level`, `trigger`, `hidden`...). The whole build is the server's
   `build` message: checked like any edit, applied all or nothing, and one
   Ctrl+Z takes it back.

   - Floors (scene levels, see "Scene levels" in game-format.md):
     `create_scene` takes `levels`; rooms and items take `level` (or
     `levels` for several floors, a staircase or a tower), and rooms on
     different floors never share walls. Stairs and lifts are regions with
     a `stairs` (`between: [lower, upper]`) or `elevator` behaviour.

   - 3D (see "The 3D view" in game-format.md and `view3d.md`): `models` stand
     glTF models (`.glb`, `.gltf`; `list_assets` with `kind: "model"` finds
     them) over boxes of the map: `src`, `height` and `elevation` in feet,
     `rotation`, `tilt`, `fill: "tile"` with `piece` squares to repeat one
     (a hedge, a palisade), `color`, `level`. Each is an image tile with a
     blank picture carrying `model`, so it shows only in the 3D view.
     `create_scene` takes `view: "3d"` (a 3D scene; flat scenes never show
     in 3D) and `view3d` (`sky`, `ground`, `walls: false` when the models
     are the walls, `background: false` when they are the floor). A creature's figure is its actor's `model`
     (`{ "src" }`), set with `edit_documents`.

   - Map pieces from the asset catalogs (a pack's `catalog.json`, see
     packs.md; Baileywiki's lists every tile, tileable texture and model with
     its size in feet). Claude always dresses scenes from them when the game
     has one: `create_scene`'s `ground` and a room's `floor` take a catalog
     texture first, laid as a repeated picture at its own size (a rect tile's
     `pattern`). In the blueprint, `props` place one piece by id or words
     (`asset`, `x`, `y`, `rotation`, `scale`) at its real size, `scatter`
     fills a box with pieces (`assets`, `count`, `spacing`, `avoid` boxes,
     `scale` range, `seed`: the same seed builds the same forest; nothing
     wider than half the box unless `maxFeet` says), and `grounds` lay
     patches of a texture (`texture`, box, `edge`, `tint`). On a 3D scene
     each piece is the pack's model, on a flat one its picture; either falls
     back to the other when the catalog has none. `find_assets` searches the
     catalog by words (`kind` tile, texture or model, `minFeet`, `maxFeet`).

3. `render_scene` draws what was built (`level`: one floor), so Claude can look and fix it;
   `describe_scene` lists the ids, which `edit_documents` (`<scene>/walls`)
   changes and `clear_area` removes.

The code is `scene-tools.ts`, `scene-blueprint.ts`, `blueprint-assets.ts` (catalog
pieces) and `room-walls.ts` (blueprints), `asset-tools.ts`, `scene-picture.ts`, `raster.ts` and `png.ts` (the picture) in
`server/src/mcp/`.

Every tool takes an optional `game` (from `list_games`). Without one it uses
the home game if you sit there, or else your first game.

The code is in `server/mcp-protocol.ts` (JSON-RPC), `mcp-tools.ts`,
`mcp-seat.ts` and `mcp-http.ts` (keys and the route).
