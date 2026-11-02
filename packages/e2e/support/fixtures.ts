// The test fixtures every spec imports instead of @playwright/test:
// `server` is a fresh server per test, `baseURL` points at it, and `seat`
// brings another person (their own browser) to the table.

import { test as base, expect, type Page } from '@playwright/test';
import { startServer, type RunningServer, type ServerOptions } from './server.ts';
import { atTable, type JoinOptions } from './table.ts';

interface Fixtures {
  /** Options for the test's server; set with `test.use({ serverOptions })`. */
  serverOptions: ServerOptions;
  server: RunningServer;
  /** Another person at the table as `player`, in a browser of their own. */
  seat: (player: string, options?: JoinOptions) => Promise<Page>;
}

export const test = base.extend<Fixtures>({
  serverOptions: [{}, { option: true }],
  server: async ({ serverOptions }, use) => {
    const server = await startServer(serverOptions);
    await use(server);
    await server.stop();
  },
  baseURL: async ({ server }, use) => {
    await use(server.url);
  },
  seat: async ({ browser, server, viewport }, use) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await use(async (player, options) => {
      const context = await browser.newContext({ baseURL: server.url, viewport });
      contexts.push(context);
      const page = await context.newPage();
      await atTable(page, player, options);
      return page;
    });
    await Promise.all(contexts.map((c) => c.close()));
  },
});

export { expect };
