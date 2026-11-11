// The test fixtures every spec imports instead of @playwright/test:
// `server` is a fresh server per test, `baseURL` points at it, and `seat`
// brings another person (their own browser) to the table. Every page starts
// with the full action bar (a 1024x640 screen would pick the compact one);
// a spec sets `test.use({ barSize: 'compact' })` to test that. And with the
// roll dialog off, so actions go at once as the specs written before it
// expect; `test.use({ rollDialog: 'on' })` plays with it, as players do.

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
  /** Whether actions wait for the roll dialog (players have it on until they turn it off). */
  rollDialog: 'on' | 'off';
}

type Start = Pick<Fixtures, 'barSize' | 'rollDialog'>;

/** Starts the page with the given action bar size and roll dialog choice, as if chosen earlier in this browser. */
async function startPrefs(page: Page, start: Start): Promise<void> {
  await page.addInitScript(({ barSize, rollDialog }) => {
    localStorage.setItem('vtt.actionBar', barSize);
    localStorage.setItem('vtt:roll-dialog', rollDialog);
  }, start);
}

export const test = base.extend<Fixtures>({
  serverOptions: [{}, { option: true }],
  barSize: ['full', { option: true }],
  rollDialog: ['off', { option: true }],
  page: async ({ page, barSize, rollDialog }, use) => {
    await startPrefs(page, { barSize, rollDialog });
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
  seat: async ({ server, viewport, barSize, rollDialog }, use) => {
    const browsers: Browser[] = [];
    await use(async (player, options) => {
      const browser = await chromium.launch();
      browsers.push(browser);
      const page = await browser.newPage({ baseURL: server.url, viewport });
      await startPrefs(page, { barSize, rollDialog });
      await atTable(page, player, options);
      return page;
    });
    await Promise.all(browsers.map((b) => b.close()));
  },
});

export { expect };
