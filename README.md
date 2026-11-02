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
- **Dice and chat.** `/r 1d20+5`, `/r 2d20kh1+4` (advantage), plus quick
  dice buttons. Roll modes as in Foundry: pick public, private GM, blind GM
  or self beside the chat box, and it holds for your rolls and the cards of
  your attacks and spells; `/gmr`, `/br`, `/sr` and `/pr` roll once in another.
  A roll card has Apply, ½, ×2 and Heal buttons: they deal the total to your
  targets (else the selected creatures), and a damage type written after the
  formula (`/r 8d6 fire`) meets resistances. The GM can undo it like any action.
- **Targets.** T over a creature (tokens mode) targets it, T over the ground
  lets them all go, or use the creature's menu. Everyone on the scene sees
  your targets in your colour. An attack readied with one target goes at it
  at once, and a spell aimed at creatures picks your targets first.
- **Live file editing.** Edit any file in `world/` and every client updates
  within a moment. `pnpm check-game` validates the folder.

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
- **Undo and redo (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y, or ↶ ↷ in the top bar).**
  Everyone undoes their own edits, 100 steps kept on the server, so a reload
  keeps them. The GM can also undo the latest game action (a move, attack,
  spell, rest), from the chat card's _Undo_ or with Ctrl+Z; the dice aren't
  rolled again and the card stays marked "undone". Undo is refused, naming
  who, when someone has changed the same thing since.
- **Copy, cut, paste, duplicate, delete (GM: Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D,
  Delete).** On the selected token, or the actor whose sheet is open. Paste
  lands at the pointer on the grid with fresh ids, through the system
  clipboard, so it works across browser tabs.
- **Both editions.** Worlds play 2014 rules by default (`"rules"` in
  `game.json`), and any character can opt into 2024 rules with
  `"stats": { "rules": "2024" }`. Monsters come from SRD 5.1 or 5.2 to match;
  weapons, armor and gear are shared. All in `packages/system-dnd5e/content/srd/`.

## Run it

Needs Node 22+ and pnpm.

```sh
pnpm install
pnpm dev          # server on :3001, client on http://localhost:5173
```

Open http://localhost:5173. The main menu offers:

- **Create an account / Sign in.** Your account keeps your characters and
  lands you in the lobby. The first account made on a server is its admin.
- **Your games** (the lobby). Every game you are in, plus games open to the
  whole server. _New game_ asks for a name, a system (D&D 5e for now) and its
  rules (2014 or 2024); you are its GM. _Join a game_ takes an invite link or
  code. A game's page lists who is at the table (GMs change roles and remove
  members), shows the invite link to the GM, and has _Enter the game_ with a
  character from your roster, or none.
- **Your characters.** Create a character, edit it, level it up, or delete it.
- **Take a seat without an account.** The home game's fixed seats from
  `game.json`, handy for a quick test: open a second browser window as
  another player to see sync and per-player views.

See [docs/lobby.md](docs/lobby.md) for how games, invites and members work.

### Accounts and characters

Accounts, characters and the games made in the lobby live in a `data/`
folder next to the world folder (set `VTT_DATA` to move it), so one roster
can visit many campaigns. Passwords are stored as salted scrypt hashes, and a sign-in lasts
30 days in an HttpOnly cookie. There's no e-mail or reset: to reset an
account, delete its file in `data/accounts/`.

The character creator follows the BG3 order: race or species, class,
background, abilities (point buy, standard array, 4d6 or manual), skills,
spells, starting equipment, then name and look. Each character picks its
rules edition: 2014 (SRD 5.1, the default) or 2024 (SRD 5.2, with
background ability bonuses, lineages and the 2024 spell tables). The server
checks every saved character against those rules. Levelling up adds hit
points (average or a roll), ability score improvements, the subclass at its
level and new spells, and updates the character's token on the map while
keeping its wounds, position and inventory.

To serve a built client from the game server alone:

```sh
pnpm build
pnpm start        # http://localhost:3001
```

Use another game folder with `VTT_GAME=/path/to/game pnpm start` (`VTT_WORLD`
still works). A folder in the old world layout (`world.json`, `chunks/`,
`tokens/`) is moved to the game layout on start, with the old files kept in
`.v1-backup/`; see [docs/game-format.md](docs/game-format.md).

## Layout

| Path                    | What it is                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/core`         | Documents, ops and undo, and `SystemDefinition`: what a game system gives the engine.                    |
| `packages/shared`       | The engine: scenes, walls, lights, vision, fog, tiles, editor shapes, permissions, lobby, base protocol. |
| `packages/system-dnd5e` | D&D 5e: creature schemas, rules, SRD content and its messages. See [docs/systems.md](docs/systems.md).   |
| `packages/server`       | Node server: loads and watches the world folder, runs the game, streams per-player views over WebSocket. |
| `packages/client`       | Vite + React UI with a PixiJS map.                                                                       |
| `world/`                | The example game. See [docs/game-format.md](docs/game-format.md).                                        |

## Checks

```sh
pnpm check         # everything below, as CI runs it
pnpm test          # unit tests (vitest)
pnpm lint          # ESLint: strict TypeScript, SonarJS, nesting and complexity limits
pnpm format        # Prettier (format:check only reports)
pnpm typecheck
pnpm quality       # coverage, then fallow: dead code, duplication, complexity, untested risk
pnpm check-game    # validate game files
```

Development is red-green: write a failing test, watch it fail, then make it
pass. Version control is [jj](https://jj-vcs.github.io/jj/), colocated with
git, so plain git tools still work.

### GM tools

- **Edit any token.** The character sheet has an edit mode for the GM:
  press E (or _Edit_ on the sheet, or click the name on the action bar).
  Name, abilities, HP (with quick Hit and Heal), AC, speed, proficiency,
  defences, inventory and spells become editable in place, and a _Details_
  tab holds the picture, size, vision, light, hidden, ownership, monster,
  rules edition, class and level. Every change saves itself.
- **Actors.** The GM's side panel has an _Actors_ tab: every creature on the
  map (click to find it, toggle hidden, edit) and the Actors list, kept in
  `actors/` in the world folder and grouped by `folder`. Every creature's
  sheet is an actor: characters' tokens are linked to theirs (one HP pool),
  monsters' tokens are unlinked copies with their own wounds. Drag an actor
  onto the map to place a token; the sheet's edit mode can unlink a token,
  save a copy's changes to its actor, reset it or link it back.
- **Compendium.** The _Compendium_ tab searches the SRD monsters, weapons,
  armour, gear and spells, from the 2014 or 2024 book. Drag a monster onto
  the map to place it (tick _Place new creatures hidden_ for an ambush), or
  drop an item or spell on a creature to give it.

## Not yet

Vision, lighting and fog (phase 2), character sheets and combat (phase 3),
spells and effects (phase 4), levels (phase 5), live AI tools (phase 6).
Fixed seats (_Take a seat without an account_) have no passwords: anyone who
can reach the server can take one. Feats, multiclassing and subclass
features beyond their names aren't in the character builder yet.
