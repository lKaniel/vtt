# The Claude bridge (MCP)

A running server answers the [Model Context Protocol](https://modelcontextprotocol.io)
at `POST /mcp`, so Claude Code or Claude Desktop can sit at a live game:
look at the table, read the chat, move tokens, roll, and build scenes by
editing documents while everyone watches.

## Connecting

1. Sign in, open your account page and press **Connect Claude**, then
   **Make a key**. The key is shown once; a new one replaces it.
2. Paste the command it shows into a terminal:

   ```sh
   claude mcp add --transport http vtt http://localhost:3001/mcp \
     --header "Authorization: Bearer vtt_..."
   ```

A server without accounts can set `VTT_MCP_KEY=<secret>` instead: that key
sits as the home game's GM.

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

Every tool takes an optional `game` (from `list_games`). Without one it uses
the home game if you sit there, or else your first game.

The code is in `server/mcp-protocol.ts` (JSON-RPC), `mcp-tools.ts`,
`mcp-seat.ts` and `mcp-http.ts` (keys and the route).
