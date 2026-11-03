# The Claude bridge (MCP)

A running server answers the [Model Context Protocol](https://modelcontextprotocol.io)
at `POST /mcp`, so Claude Code or Claude Desktop can sit at a live game:
look at the table, read the chat, move tokens, roll, and build scenes by
editing documents while everyone watches.

## Connecting

1. Join the game, open its page and press **Connect Claude**, then
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

| Tool                             | What it does                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `guide`                          | The game format (docs/game-format.md), to read first                               |
| `list_games`                     | Your games and your role in each                                                   |
| `look`                           | Scene, tokens (pixels, HP for those you may see), combat, players, document counts |
| `read_chat`                      | The last chat messages and roll cards                                              |
| `list_documents`, `get_document` | Read any document you may read (`actors`, `journals`, `<scene>/walls`...)          |
| `edit_documents`                 | Create, update or delete documents, all or nothing, as one undo step               |
| `say`                            | Chat as you, including `/r` rolls                                                  |
| `move_token`                     | Walk a token to a point                                                            |
| `undo`                           | Undo your last step                                                                |
| `send`                           | Any other message a browser sends (start combat, run a macro...)                   |
| `create_scene`                   | A new scene, with a ground tile of a given size                                    |
| `build_scene`                    | Rooms, walls, doors, lights, floors, creatures, regions... from a blueprint        |
| `describe_scene`                 | A scene's settings and every item on it, by collection                             |
| `render_scene`                   | A top-down picture of a scene (or part of it), with a legend                       |
| `clear_area`                     | Deletes what lies inside a box                                                     |
| `go_to_scene`                    | Takes your view, or the whole game, to a scene                                     |

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

3. `render_scene` draws what was built (`level`: one floor), so Claude can look and fix it;
   `describe_scene` lists the ids, which `edit_documents` (`<scene>/walls`)
   changes and `clear_area` removes.

The code is `scene-tools.ts`, `scene-blueprint.ts` and `room-walls.ts`
(blueprints), `scene-picture.ts`, `raster.ts` and `png.ts` (the picture) in
`server/src/mcp/`.

Every tool takes an optional `game` (from `list_games`). Without one it uses
the home game if you sit there, or else your first game.

The code is in `server/mcp-protocol.ts` (JSON-RPC), `mcp-tools.ts`,
`mcp-seat.ts` and `mcp-http.ts` (keys and the route).
