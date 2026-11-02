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
report and traces of a failed run as the `e2e-report` artifact
(`npx playwright show-trace <trace.zip>` replays one).

## How a spec runs

- **A fresh server for every test** (`support/server.ts`): `world/` copied into
  a temporary folder as the home game, its own data folder (`VTT_DATA`) and a
  free port. Tests never see each other's changes and run in parallel.
  `test.use({ serverOptions: { adminPassword } })` starts it with
  `VTT_ADMIN_PASSWORD`. `server.gameDir` and `server.dataDir` are there for
  specs that check what was written to disk.
- **Getting to the table** (`support/table.ts`) goes through the same screens a
  person uses: `joinGame` (join screen), `enterTable` (_Enter the game_), or
  both in `atTable`. The `seat` fixture brings another person in a browser of
  their own (own cookies), so a spec can have a GM and players at one table.
- **Reading the table** uses `vtt`, the scripting API every open table puts on
  the page (`docs/scripting.md`): `page.evaluate(() => vtt.tokens())`. The
  canvas is never pixel-matched. Act through the screens (buttons, chat,
  sheet) wherever a person would; `vtt` calls are what a script could do too,
  so they never get around the server's checks.

## Writing one

- Import `test` and `expect` from `support/fixtures.ts`, not `@playwright/test`.
- Find things by role and name, as a screen reader would
  (`getByRole('button', { name: 'Start combat' })`); when a screen has nothing
  to find it by, give it an accessible name in the component, not a test id.
- Wait with `expect(...)` (it retries) or `expect.poll`, never fixed sleeps.
- New screens get a spec when they ship, next to their feature's unit tests.
