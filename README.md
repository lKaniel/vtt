# VTT

A self-hosted virtual tabletop for D&D 5e, built in TypeScript. The goal is
Foundry-level maps, a Baldur's Gate 3 style player experience, heavy rules
automation and a world that Claude can edit straight from chat.

This is **phase 1, the table foundation**: one big map you can walk around
on, shared live between players.

## What works now

- **One infinite map.** The world is split into chunks that stream in around
  the camera; only what's on screen is drawn. Grid, labels and door handles
  drop out as you zoom out.
- **Tokens and click-to-move.** Select one of your tokens, hover the ground to
  preview the path and its distance in feet, click to walk. The server checks
  every move against walls.
- **Walls and doors.** Doors open and close for everyone; the GM can
  shift-click to lock or unlock.
- **Per-player views.** Hidden tokens are GM-only, and a token with
  `visibleTo` is seen only by those players. This is the hook illusions use.
- **Dice and chat.** `/r 1d20+5`, `/r 2d20kh1+4` (advantage), `/gmr` for a
  roll only the GM sees, plus quick dice buttons.
- **Live file editing.** Edit any file in `world/` and every client updates
  within a moment. `pnpm check-world` validates the folder.

## Run it

Needs Node 22+ and pnpm.

```sh
pnpm install
pnpm dev          # server on :3001, client on http://localhost:5173
```

Open http://localhost:5173, pick a seat, and open a second browser window as
another player to see sync and per-player views.

To serve a built client from the game server alone:

```sh
pnpm build
pnpm start        # http://localhost:3001
```

Use another world folder with `VTT_WORLD=/path/to/world pnpm start`.

## Layout

| Path | What it is |
| --- | --- |
| `packages/shared` | World schema, geometry, pathfinding, dice, permissions, network protocol. Used by both sides. |
| `packages/server` | Node server: loads and watches the world folder, runs the game, streams per-player views over WebSocket. |
| `packages/client` | Vite + React UI with a PixiJS map. |
| `world/` | The example world. See [docs/world-format.md](docs/world-format.md). |

## Checks

```sh
pnpm test          # unit tests
pnpm typecheck
pnpm check-world   # validate world files
```

## Not yet

Vision, lighting and fog (phase 2), character sheets and combat (phase 3),
spells and effects (phase 4), levels (phase 5), live AI tools (phase 6).
Seats have no passwords yet: anyone who can reach the server can join.
