# Notes for Claude

## Editing the world from chat

The game is plain JSON in `world/` (or the folder in `VTT_GAME`), the
server's home game. Games made in the lobby are folders in
`data/games/<id>/` with the same layout (see `docs/lobby.md`). The running
server hot-reloads any file you change in a loaded game, so editing files is
how you add maps, place tokens, and prepare encounters. Check another game
with `pnpm check-game data/games/<id>`.

- Read `docs/game-format.md` before editing. Coordinates are pixels;
  tokens sit on square centres (`(col + 0.5) * gridSize`).
- `game.json` names the active scene; each scene is a folder
  `scenes/<scene>/`: `scene.json` (name, grid, darkness, fog) and one list per
  collection, `tiles.json`, `walls.json`, `lights.json`, `tokens.json`,
  `drawings.json`, `notes.json`, `templates.json`, `regions.json`,
  `sounds.json`. A new scene is a new folder with a `scene.json`. Leave
  `fog/` alone (the server's).
- Journal entries, roll tables and playlists are one file each in
  `journals/`, `tables/`, `playlists/`. Traps, teleporters and difficult
  ground are regions with behaviours; floors are scene `levels` (see
  "Scene levels" in the format doc).
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
  are in `packages/system-dnd5e/content/srd/`, or in a pack the game turns on
  (game.json `packs`, see `docs/packs.md`); `check-game` flags unknown ones.
- Pictures from an asset pack are `pack://<pack>/<path>`; the game's own are
  `/assets/<path>`.
- Keep ids lowercase with dashes, unique within their list (a scene's walls, its tokens).

## Code

- TypeScript monorepo: `packages/core` (documents, `SystemDefinition`),
  `packages/shared` (the engine: scenes, walls, vision, fog, editor, lobby),
  `packages/system-dnd5e` (D&D rules, schemas and SRD content), `server`, `client`.
- Systems (`docs/systems.md`): the engine (core and shared) knows no D&D;
  `shared/engine-boundary.test.ts` fails on a system import or rules words
  there. D&D code goes in `system-dnd5e`; the engine reaches a system only
  through `SystemDefinition` (`core/system.ts`). A game names its system in
  game.json; the server's systems are registered in `server/systems.ts`.
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
  `token-link.ts` in system-dnd5e merges them with their actor (`resolveToken`) so
  rules code sees one `Token`, and `splitToken` puts a changed token back
  (linked: into the actor). `store.tokens` holds resolved tokens and
  `store.setToken` splits, so game code keeps working on whole tokens.
- Rules live in `system-dnd5e` and geometry in `shared`, so the server can
  enforce them and the client can preview them with the same code. Don't
  duplicate them.
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
- World time: `clock.ts` in shared (clock, calendar, darkness by time of day),
  `durations.ts` (what lasts: `endsAt` on effects, concentration, summons), the
  server's `world-clock.ts` and `time-out.ts`. Fights and turn-based mode
  (`combat.peaceful`) move the clock 6 s a round; rests skip 1 h / 8 h.
- SRD spells, classes and monsters are generated by `import-srd`; automation
  goes in `content/srd/spell-automation.json` and `class-automation.json`
  (keys `both`, `2014`, `2024`), never in the generated files.
- Time of day is read in one place, `activeAt()` in `shared/levels.ts`
  (lights, regions and sounds with a darkness band); world time hooks there.
  Lasting spell zones are server-kept templates (`zone-templates.ts`).
- UI components: every screen is built from the component library in
  `packages/client/src/ui/kit` (shadcn/ui on Radix and Tailwind, restyled in
  the game's bronze and iron look; tokens in `client/src/index.css`). Use
  its Button, Input, NumberField, Select, Popover, Tabs, Slider, ToggleGroup,
  Badge, Card, CalendarMonth and the rest, never a bare `<button>`, `<input>`
  or `<select>` or one-off CSS for them. When the kit lacks something, add it
  to the kit first (shadcn's version when there is one, in the same style,
  with a `data-slot`) and dress it in the painted art through the
  `art-*` utilities in `index.css` (panel, button plates, slots, divider),
  then use it. Lay screens out with Tailwind classes;
  `style.css` is the older hand-written layer and only shrinks.
- Map editor (`docs/editor.md`): modes, selection, handles, menus and the
  inspector work the same for every placeable. Hit-testing and shapes stay
  in `shared/hit-test.ts` and `placeables.ts` (one boundary for a later
  Rust/WASM port); a new type adds a shape, handles, inspector fields and
  `registerMenu` entries there, never per-type canvas code.
- Rules editions: the world plays `rules` (missing = the system's default,
  2014 for D&D: SRD 5.1) and a character can opt into the other with
  `stats.rules`. Look content up with
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
