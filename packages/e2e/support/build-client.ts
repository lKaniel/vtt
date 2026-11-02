// Builds the client once before the run, so the servers serve what is in
// the working tree. E2E_NO_BUILD=1 skips it (CI builds in an earlier step).

import { execSync } from 'node:child_process';
import { repoRoot } from './server.ts';

export default function buildClient(): void {
  if (process.env.E2E_NO_BUILD) return;
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- a dev tool: pnpm from the developer's own PATH
  execSync('pnpm --filter @vtt/client build', { cwd: repoRoot, stdio: 'inherit' });
}
