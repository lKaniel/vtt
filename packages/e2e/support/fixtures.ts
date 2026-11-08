// The test fixtures every spec imports instead of @playwright/test:
// `server` is a fresh server per test, `baseURL` points at it, and `seat`
// brings another person (their own browser) to the table. Every page starts
// with the full action bar (a 1024x640 screen would pick the compact one);
// a spec sets `test.use({ barSize: 'compact' })` to test that.

import { chromium, test as base, expect, type Browser, type Page } from '@playwright/test';
import { startServer, type RunningServer, type ServerOptions } from './server.ts';
import { atTable, type JoinOptions } from './table.ts';

interface Fixtures {
  /** Options for the test's server; set with `test.use({ serverOptions })`. */
  serverOptions: ServerOptions;
  server: RunningServer;
  /** Another person at the table as `player`, in a browser of their own. */
  seat: (player: string, options?: JoinOptions) => Promise<Page>;
  /** The action bar size each page starts with. */
  barSize: 'full' | 'compact';
}

/** Starts the page with the given action bar size, as if chosen earlier in this browser. */
async function startBar(page: Page, size: string): Promise<void> {
  await page.addInitScript((size) => localStorage.setItem('vtt.actionBar', size), size);
}

export const test = base.extend<Fixtures>({
  serverOptions: [{}, { option: true }],
  barSize: ['full', { option: true }],
  page: async ({ page, barSize }, use) => {
    await startBar(page, barSize);
    await use(page);
  },
  server: async ({ serverOptions }, use) => {
    const server = await startServer(serverOptions);
    await use(server);
    await server.stop();
  },
  baseURL: async ({ server }, use) => {
    await use(server.url);
  },
  // Each person gets a browser of their own: two WebGL tables in one browser
  // share its (software) GPU and starve each other.
  seat: async ({ server, viewport, barSize }, use) => {
    const browsers: Browser[] = [];
    await use(async (player, options) => {
      const browser = await chromium.launch();
      browsers.push(browser);
      const page = await browser.newPage({ baseURL: server.url, viewport });
      await startBar(page, barSize);
      await atTable(page, player, options);
      return page;
    });
    await Promise.all(browsers.map((b) => b.close()));
  },
});

export { expect };
