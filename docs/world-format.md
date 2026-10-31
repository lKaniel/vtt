# World format

A world is a folder of JSON files. The server loads it on start, watches it,
and writes game changes (token moves, doors) back to it. Editing a file by
hand or with Claude updates every connected client live.

```
world/
  world.json          settings and players
  chunks/<cx>_<cy>.json   map content, one file per chunk
  tokens/<id>.json    one file per token
  assets/             images referenced by tiles and tokens
```

Run `pnpm check-world` after editing. It reports every problem with the file
and field it's in. The schemas live in `packages/shared/src/schema.ts`.

## Coordinates

Everything is in **pixels** on one unbounded plane. `x` grows right, `y`
grows down, negative values are fine.

- `gridSize` pixels make one 5 ft square (default 100).
- `chunkSize` pixels make one chunk side (default 2000, so 20 by 20 squares).
- The square at column `c`, row `r` spans `c*gridSize` to `(c+1)*gridSize`.
  Its centre is `(c + 0.5) * gridSize`. Tokens stand on square centres, so
  with `gridSize: 100` a token sits at `x: 550`, not `x: 500`.
- Walls run along square edges, so their ends are multiples of `gridSize`.

## world.json

```json
{
  "name": "The crossroads",
  "gridSize": 100,
  "chunkSize": 2000,
  "start": [1000, 900],
  "players": [
    { "id": "gm", "name": "GM", "role": "gm", "color": "#e0b040" },
    { "id": "player1", "name": "Player 1", "role": "player", "color": "#5a9be0" }
  ]
}
```

At least one player must have `"role": "gm"`. `start` is where the camera
opens. Changing this file reconnects everyone.

## Chunks

A chunk file holds the tiles and walls of one `chunkSize` square of the map.
The file name is the chunk's column and row: `0_0.json` covers pixels 0 to
1999 on both axes, `-1_0.json` covers x -2000 to -1, and so on. Coordinates
inside the file are **absolute** map pixels, not relative to the chunk.

Put each item in the chunk where it starts (a tile's top-left corner, a
wall's midpoint). The checker warns when one is in the wrong file.

```json
{
  "tiles": [
    { "kind": "rect", "id": "grass", "x": 0, "y": 0, "w": 2000, "h": 2000, "color": "#4f6b3a" },
    { "kind": "image", "id": "tavern", "x": 400, "y": 200, "w": 800, "h": 600, "src": "maps/tavern.webp" }
  ],
  "walls": [
    { "id": "tavern-n", "a": [400, 200], "b": [1200, 200] },
    { "id": "tavern-door", "a": [700, 800], "b": [800, 800], "door": "closed" }
  ]
}
```

- Tiles draw in file order, later ones on top. `image` tiles load from
  `assets/`.
- A wall is a line from `a` to `b` that blocks movement. Add `door` to make
  it a door: `"closed"`, `"open"` or `"locked"`. Open doors don't block.
- Ids must be unique within the chunk.

## Tokens

```json
{
  "id": "bram",
  "name": "Bram",
  "x": 650,
  "y": 650,
  "size": 1,
  "color": "#c0603a",
  "speed": 30,
  "controllers": ["player2"],
  "hidden": false
}
```

| Field | Meaning |
| --- | --- |
| `id` | Lowercase letters, digits, dashes. Must match the file name. |
| `x`, `y` | Centre of the token in pixels (a square centre). |
| `size` | In squares: 1 medium, 2 large, 3 huge. Default 1. |
| `color` | Disc colour until token art exists. |
| `speed` | Walking speed in feet. Default 30. |
| `controllers` | Player ids who may move it. The GM always can. |
| `hidden` | `true` = only the GM sees it. |
| `visibleTo` | If set, only these players (and the GM) see it. Used for illusions. |
