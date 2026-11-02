import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: real servers (one per test, see support/server.ts) and a
// real browser. `pnpm e2e` from the repo root builds the client first.
export default defineConfig({
  testDir: 'specs',
  globalSetup: './support/build-client.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1024, height: 640 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
