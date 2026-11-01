# Notes for Claude

## Editing the world from chat

The game is plain JSON in `world/` (or the folder in `VTT_GAME`).
The running server hot-reloads any file you change, so editing files is how
you add maps, place tokens, and prepare encounters.

- Read `docs/game-format.md` before editing. Coordinates are pixels;
  tokens sit on square centres (`(col + 0.5) * gridSize`).
- `game.json` names the active scene; each scene is a folder
  `scenes/<scene>/`: `scene.json` (name, grid, darkness, fog) and one list per
  collection, `tiles.json`, `walls.json`, `lights.json`, `tokens.json`. A new
  scene is a new folder with a `scene.json`. Leave `fog/` alone (the server's).
- A creature's sheet is an actor (`actors/<id>.json`); a token in
  `tokens.json` is an actor standing there: `{ "id", "x", "y", "actor",
"linked" }`. Characters are linked (they share the actor's HP); monsters
  are unlinked copies whose own changes (hp, a numbered name) go in `delta`.
  Three goblins = one `goblin` actor + three tokens.
- Always run `pnpm check-game` after editing and fix every error.
- Hidden enemies for an encounter: `"hidden": true`, the GM reveals them.
- Creatures the GM may want later (an ambush, reinforcements) go in
  `actors/<id>.json` with an optional `folder` and no token yet. The GM
  drags them onto the map from the Actors tab.
- Creatures: `"monster": "<srd id>"` for a stat block, or `stats` + `inventory`
  for a character (see "Creatures" in the format doc). Monster and item ids
  are in `packages/shared/content/srd/`; `check-game` flags unknown ones.
- Keep ids lowercase with dashes, unique within their list (a scene's walls, its tokens).

## Code

- TypeScript monorepo: `packages/shared` (used by both sides), `server`, `client`.
- `packages/core` is the new document layer from the redesign (docs, ops with
  undo, sort keys, trees, migrations). It knows nothing about D&D; new game
  state should be built on it.
- `GameStore` (`server/src/game-store.ts`) holds the game folder as core
  documents: hand edits become ops, changes are written back per collection
  file. Every scene is kept live (`scene-state.ts`: chunks cut by position,
  resolved tokens). `store.tokens`, `chunks`, `world`, `setToken` and the
  rest read "the current scene": the one `store.inScene(id, fn)` names, else
  the game's. `Game` runs each client message inside `inScene(client.scene)`,
  so rules code never takes a scene argument. Seats sit on a scene
  (`sceneOf` in `scene-actions.ts`).
- Explored fog of war is not a document: `fog-store.ts` keeps it per scene
  and player (bitmaps from `shared/fog.ts`), `fog-keeper.ts` explores after
  anything changes what a player sees, and GM fog edits join undo steps.
- Tokens are stored as entries (placement + `actor`, `linked`, `delta`);
  `token-link.ts` in shared merges them with their actor (`resolveToken`) so
  rules code sees one `Token`, and `splitToken` puts a changed token back
  (linked: into the actor). `store.tokens` holds resolved tokens and
  `store.setToken` splits, so game code keeps working on whole tokens.
- Rules and geometry live in `shared` so the server can enforce them and the
  client can preview them with the same code. Don't duplicate them.
- The server is authoritative: clients send intents, the server validates
  and broadcasts each player's filtered view (`canSee`, `viewToken`).
- Edits are document ops (see `docs/edits.md`): a client sends an `ops`
  transaction, the server checks each op against the sender's ownership
  (`op-permissions.ts`) and the file schemas (`doc-checks.ts`) and applies
  it all or nothing. Each client is sent only the documents it may read
  (`doc-feed.ts`). Every message is
  one undo step (`undo.ts`): edits per user, game actions GM-undoable. Copy,
  cut, paste, duplicate and delete go through one registry, `EDIT_KINDS` in
  `shared/edit-kinds.ts`; a new document type adds itself there and gets a
  sample in `server/edit-commands.test.ts`, never its own clipboard code.
- Who may do what lives in `permissions.ts`: seat roles (gm, trusted, player,
  observer) and Foundry-style `ownership` levels on documents (none, limited,
  observer, owner). Check with its helpers (`isGm`, `canSee`, `canObserve`,
  `canControl`, `canEdit`), never `role === 'gm'` or the levels by hand.
- Combat rules: `creature.ts` (stats from monster/gear), `attack.ts` (rolls,
  damage, range), `combat.ts` (initiative, turns). The server applies them
  in `combat-actions.ts`; a rule violation throws `Refusal`.
- Magic: `spells.ts` (casting, scaling, areas via `areas.ts`), `effects.ts`
  (effects on tokens, concentration, saves), `features.ts` (class features,
  rests), `classes.ts` (slots and class sheets). The server applies them in
  `spell-actions.ts` and `feature-actions.ts`, sharing turn budgets and
  damage through `table.ts`. Summons are tokens with `summon` (vanish when
  the spell ends) and either their own initiative or a `leader`.
- SRD spells, classes and monsters are generated by `import-srd`; automation
  goes in `content/srd/spell-automation.json` and `class-automation.json`
  (keys `both`, `2014`, `2024`), never in the generated files.
- Map editor (`docs/editor.md`): modes, selection, handles, menus and the
  inspector work the same for every placeable. Hit-testing and shapes stay
  in `shared/hit-test.ts` and `placeables.ts` (one boundary for a later
  Rust/WASM port); a new type adds a shape, handles, inspector fields and
  `registerMenu` entries there, never per-type canvas code.
- Rules editions: the world plays `rules` ("2014" default, SRD 5.1) and a
  character can opt into the other with `stats.rules`. Look content up with
  `srdFor(editionOf(token, world))`; edition-specific rules (class features,
  weapon mastery) must branch on that edition, never assume one.
- Bundled content is SRD 5.1 and 5.2 (CC-BY-4.0) only; anything else is the user's
  own homebrew and stays out of the repo.
- Red-green always: write the failing test first, run it and see it fail,
  then write the code that makes it pass.
- Keep functions small and flat: ESLint and fallow enforce complexity 12,
  nesting depth 3, 4 params, 80-line functions. Split code rather than
  disabling a rule; a suppression needs a `--` reason.
- Before committing: `pnpm check` (format, lint, typecheck, tests with
  coverage, fallow, check-game). `pnpm format` fixes formatting.
- Version control is jj (colocated with git): `jj describe`, `jj new`,
  `jj bookmark set <name>`, `jj git push`. Don't run mutating git commands.
