# End-to-end tests

`packages/e2e` drives the real game in a real browser (Playwright, Chromium).
Unit tests check the rules and the engine; these check that the screens,
the server and the rules work together the way a person at the table uses them.

```sh
pnpm e2e                    # builds the client, then runs every spec
pnpm e2e specs/join.spec.ts # one file (any Playwright arguments work)
E2E_NO_BUILD=1 pnpm e2e     # skip the build when the client is already built
```

The first time on a new machine, `pnpm --filter @vtt/e2e exec playwright install chromium`
fetches the browser. CI runs the suite as its own `e2e` job and keeps the
report and traces of a failed run as `e2e-report-*` artifacts
(`npx playwright show-trace <trace.zip>` replays one). It runs one test at a
time per machine, split over three machines (`--shard`).

## How a spec runs

- **A fresh server for every test** (`support/server.ts`): `world/` copied into
  a temporary folder as the home game, its own data folder (`VTT_DATA`) and a
  free port. Tests never see each other's changes and run in parallel.
  `test.use({ serverOptions: { adminPassword } })` starts it with
  `VTT_ADMIN_PASSWORD`, `prepare: (gameDir) => …` edits the game's files
  first (`support/files.ts`), and `seed` seeds the server's dice
  (`support/seeded-random.ts`) so a roll comes out the same every run. A spec
  never depends on luck: seed the dice and set the odds (an AC 1 goblin).
  `server.gameDir` and `server.dataDir` are there for
  specs that check what was written to disk.
- **Getting to the table** (`support/table.ts`) goes through the same screens a
  person uses: `joinGame` (join screen), `enterTable` (_Enter the game_), or
  both in `atTable`. The `seat` fixture brings another person in a browser of
  their own, so a spec can have a GM and players at one table.
- **The roll dialog is off** in every page the fixtures open, so an action
  goes at once; `test.use({ rollDialog: 'on' })` plays with it, as players do
  (`specs/roll-dialog.spec.ts`).
- **Reading the table** uses `vtt`, the scripting API every open table puts on
  the page (`docs/scripting.md`): `page.evaluate(() => vtt.tokens())`. The
  canvas is never pixel-matched. Act through the screens (buttons, chat,
  sheet) wherever a person would; `vtt` calls are what a script could do too,
  so they never get around the server's checks.

## The map

- `support/map.ts` points at the map: a scene opens with its camera on the
  scene's `start` at zoom 0.6, so `screenOf(page, x, y)` turns a world point
  into a place on the page, and `dragOnMap` drags a token with the mouse. Pick
  points that land on the open map, not under the top bar or a panel (the
  viewport is 1024×640).
- Headless Chromium draws WebGL in software, at a few frames a second, and
  every mouse event waits for a frame. Keep canvas input to a few events, and
  give a spec with three browsers `test.slow()`.
- Each `seat` is a separate browser, not just a context: two tables in one
  browser share its software GPU and starve each other.

## Writing one

- Import `test` and `expect` from `support/fixtures.ts`, not `@playwright/test`.
- Find things by role and name, as a screen reader would
  (`getByRole('button', { name: 'Start combat' })`); when a screen has nothing
  to find it by, give it an accessible name in the component, not a test id.
- Wait with `expect(...)` (it retries) or `expect.poll`, never fixed sleeps.
- New screens get a spec when they ship, next to their feature's unit tests.
