# Notes for Claude

## Editing the world from chat

The game world is plain JSON in `world/` (or the folder in `VTT_WORLD`).
The running server hot-reloads any file you change, so editing files is how
you add maps, place tokens, and prepare encounters.

- Read `docs/world-format.md` before editing. Coordinates are pixels;
  tokens sit on square centres (`(col + 0.5) * gridSize`).
- One token per file in `tokens/`, file name = id. Map content goes in the
  chunk file for where it starts: chunk `floor(x / chunkSize)_floor(y / chunkSize)`.
- Always run `pnpm check-world` after editing and fix every error.
- Hidden enemies for an encounter: `"hidden": true`, the GM reveals them.
- Keep ids lowercase with dashes, unique per chunk (tiles, walls) or per world (tokens).

## Code

- TypeScript monorepo: `packages/shared` (used by both sides), `server`, `client`.
- Rules and geometry live in `shared` so the server can enforce them and the
  client can preview them with the same code. Don't duplicate them.
- The server is authoritative: clients send intents, the server validates
  and broadcasts each player's filtered view (`canSeeToken`).
- Red-green always: write the failing test first, run it and see it fail,
  then write the code that makes it pass.
- Keep functions small and flat: ESLint and fallow enforce complexity 12,
  nesting depth 3, 4 params, 80-line functions. Split code rather than
  disabling a rule; a suppression needs a `--` reason.
- Before committing: `pnpm check` (format, lint, typecheck, tests with
  coverage, fallow, check-world). `pnpm format` fixes formatting.
- Version control is jj (colocated with git): `jj describe`, `jj new`,
  `jj bookmark set <name>`, `jj git push`. Don't run mutating git commands.
