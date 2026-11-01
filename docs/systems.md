# Game systems

A game runs on one **system**: the rules, content and creature sheets it
plays by. The engine (scenes, walls, lights, vision, fog, tiles, the editor,
the lobby) knows nothing of hit points or spells; a system package brings
those. D&D 5e is the only system so far.

## Packages

| Package                 | What it holds                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/core`         | Documents, ops, undo, and `SystemDefinition` / `SystemRegistry` (`src/system.ts`).                |
| `packages/shared`       | The engine. `engine-boundary.test.ts` fails if it imports a system or uses D&D words in its code. |
| `packages/system-dnd5e` | D&D 5e: creature schemas, rules, SRD 5.1 and 5.2 content, its protocol messages.                  |
| `packages/server`       | Registers the systems it runs (`src/systems.ts`) and gives each game its own.                     |

Dependencies point one way: `core` ← `shared` ← `system-dnd5e` ← `server`,
`client`.

## What a system gives the engine

`SystemDefinition` in `core/src/system.ts`:

- `id`, `name` and `editions` (the first is the default). The lobby lists
  them from the server's registry (`GET /api/games` returns `systems`), and
  `newGameIssues` checks a new game against them.
- `tokenSchema` and `actorSchema`: a token is the engine's placement
  (`PlacedToken` in `shared/schema.ts`: id, position, ownership, hidden,
  light) plus the system's sheet; an actor is the sheet alone.
- `tokenIssues(sheet, edition)`: what a token or actor refers to that the
  edition lacks (an unknown monster, item or spell). `check-game` and the
  server's load check report these.

D&D adds `perceiver(token, rules)`: senses (darkvision, blindsight,
tremorsense, truesight) and the blinded and invisible conditions. The
engine's `tokensVisibleTo` and the fog keeper take that and do the light,
walls and line of sight themselves (`shared/senses.ts`).

## Games and their system

`game.json` has `"system"` (default `"dnd5e"`, so older games keep working)
and `"rules"` (an edition of that system; missing means the system's
default). `GameHub.start` looks the system up when a game loads and refuses
to load a game whose system the server doesn't have. The running game's
`GameStore.system` is the one the rules code asks.

## The protocol

`shared/protocol.ts` has the engine's messages (`EngineClientMessage`,
`EngineServerMessage`: chunks, walls, fog, docs, undo, scenes). A system adds
its own; D&D's full `ClientMessage` and `ServerMessage` unions are in
`system-dnd5e/src/protocol.ts` (attacks, spells, features, reactions,
creature views, chat cards).

## Not done yet

- The server's D&D action handlers (`combat-actions.ts`, `spell-actions.ts`,
  `feature-actions.ts`, `reactions.ts`, `table.ts`) and the client's sheets,
  creator and level-up still import `@vtt/system-dnd5e` directly. With a
  second system they would move behind the definition (actions as system
  handlers, sheets as system UI), and `GameStore.system` would be typed as
  any `SystemDefinition`.
- Rules content is the SRD plus the game's packs: `contentWith(edition,
compendia)` on the server (`game-packs.ts` `contentFor`) and `gameContent`
  on the client. The SRD is the system's own packs `dnd5e-srd-2014` and
  `dnd5e-srd-2024` (`SystemDefinition.packs`), always on; see
  [packs.md](packs.md). The character creator and level-up still read the
  bare SRD (`srdFor`).
- World time (step 13): the clock (`game.time`, calendar) belongs to the
  engine; when an effect, concentration or a rest ends is the system's call,
  so effect expiry by world time goes in `system-dnd5e/src/effects.ts`
  behind one helper, and the clock never learns D&D.
