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

### Combat (phase 3)

- **Creatures.** A token with `"monster": "goblin"` uses that SRD stat
  block; a character gets AC, attacks and proficiency from its `stats`, level
  and equipped gear. Players see their own sheets and only a health state
  (hurt, bloodied, down) for everyone else.
- **Initiative and turns.** The GM's _Start combat_ rolls initiative for every
  creature on screen. Only the creature whose turn it is can move, within
  what's left of its speed (the path preview shows `feet / left`). Space or
  _End turn_ passes the turn; creatures at 0 HP are skipped.
- **Attacks.** Press 1-8 or click a hotbar slot, hover a target to see range
  (long range shows disadvantage), click to attack. The server rolls to hit
  against AC, crits on a 20, applies resistances, vulnerabilities and
  immunities, and posts the result in chat. Right click (or Esc) puts a
  readied attack or aimed spell away.
- **Spell slots.** While a spell is aimed, the bar above the hotbar picks the
  slot level to cast it with, or _Free_ to cast without spending one (the log
  says so). In the sheet's edit mode the GM clicks slot and feature charge
  pips to spend or restore them.
- **Character sheet (C, or double-click your token).** Abilities, AC, HP and
  tabs for Inventory, Spells, Features and Effects; click an item to equip it.
- **Arrange the action bar.** Drag spells, attacks, features and items from
  the sheet onto the bar, and drag tiles to swap them. The layout is saved
  on the token (`hotbar`); new abilities fill the gaps.
- **Moving.** Click where to go, drag your token there, or step with the
  arrow keys.
- **Both editions.** Worlds play 2014 rules by default (`"rules"` in
  `world.json`), and any character can opt into 2024 rules with
  `"stats": { "rules": "2024" }`. Monsters come from SRD 5.1 or 5.2 to match;
  weapons, armor and gear are shared. All in `packages/shared/content/srd/`.

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

| Path              | What it is                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/shared` | World schema, geometry, pathfinding, dice, permissions, network protocol. Used by both sides.            |
| `packages/server` | Node server: loads and watches the world folder, runs the game, streams per-player views over WebSocket. |
| `packages/client` | Vite + React UI with a PixiJS map.                                                                       |
| `world/`          | The example world. See [docs/world-format.md](docs/world-format.md).                                     |

## Checks

```sh
pnpm check         # everything below, as CI runs it
pnpm test          # unit tests (vitest)
pnpm lint          # ESLint: strict TypeScript, SonarJS, nesting and complexity limits
pnpm format        # Prettier (format:check only reports)
pnpm typecheck
pnpm quality       # coverage, then fallow: dead code, duplication, complexity, untested risk
pnpm check-world   # validate world files
```

Development is red-green: write a failing test, watch it fail, then make it
pass. Version control is [jj](https://jj-vcs.github.io/jj/), colocated with
git, so plain git tools still work.

### GM tools

- **Edit any token.** The character sheet has an edit mode for the GM:
  press E (or _Edit_ on the sheet, or click the name on the action bar).
  Name, abilities, HP (with quick Hit and Heal), AC, speed, proficiency,
  defences, inventory and spells become editable in place, and a _Details_
  tab holds the picture, size, vision, light, hidden, controllers, monster,
  rules edition, class and level. Every change saves itself.
- **Actors.** The GM's side panel has an _Actors_ tab: every creature on the
  map (click to find it, toggle hidden, edit) and the Actors list, kept in
  `actors/` in the world folder and grouped by `folder`. Drag an actor onto
  the map to place a copy; _Save as actor_ keeps any token for later.
- **Compendium.** The _Compendium_ tab searches the SRD monsters, weapons,
  armour, gear and spells, from the 2014 or 2024 book. Drag a monster onto
  the map to place it (tick _Place new creatures hidden_ for an ambush), or
  drop an item or spell on a creature to give it.

## Not yet

Vision, lighting and fog (phase 2), character sheets and combat (phase 3),
spells and effects (phase 4), levels (phase 5), live AI tools (phase 6).
Seats have no passwords yet: anyone who can reach the server can join.
