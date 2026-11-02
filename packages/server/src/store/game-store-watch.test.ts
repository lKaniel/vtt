import type * as Fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { GameStore } from './game-store.ts';
import { makeWorld } from '../test/fixtures.ts';

// The store follows its folder for hand edits. Node's folder watcher
// reports an error when a folder in it vanishes as it looks (rm -rf of
// cards/, say); that must not take the server down.

const watchers: Fs.FSWatcher[] = [];

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof Fs>();
  const watch = (...args: Parameters<typeof fs.watch>) => {
    const w = fs.watch(...args);
    watchers.push(w);
    return w;
  };
  return { ...fs, watch, default: { ...fs, watch } };
});

describe('following the game folder', () => {
  it('shrugs off the watcher’s errors', async () => {
    const store = new GameStore(await makeWorld());
    await store.load();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.watch();
    try {
      const watcher = watchers.at(-1)!;
      expect(() => watcher.emit('error', Object.assign(new Error('ENOENT: gone'), { code: 'ENOENT' }))).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('ENOENT: gone'));
    } finally {
      store.close();
      warn.mockRestore();
    }
  });
});
