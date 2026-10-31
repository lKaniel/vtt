import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Token } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { makeWorld } from './test/fixtures.ts';
import { WorldStore } from './world-store.ts';

async function loaded(): Promise<{ dir: string; store: WorldStore }> {
  const dir = await makeWorld();
  const store = new WorldStore(dir);
  await store.load();
  return { dir, store };
}

function nextToken(store: WorldStore): Promise<Token> {
  return new Promise((resolve) => store.once('token', resolve));
}

describe('WorldStore', () => {
  it('loads every file and finds walls and lights near a point', async () => {
    const { store } = await loaded();
    expect(store.world.name).toBe('Test');
    expect(store.tokens.size).toBe(2);
    expect(store.wallsBetween([150, 150], [550, 150]).map((w) => w.id)).toContain('door');
    expect(store.lights().map((l) => [l.x, l.y])).toEqual([[550, 150]]);
  });

  it('writes changes back to the files', async () => {
    const { dir, store } = await loaded();
    store.setToken({ ...store.tokens.get('hero')!, x: 50 });
    await store.flush();
    expect(JSON.parse(await readFile(join(dir, 'tokens/hero.json'), 'utf8'))).toMatchObject({ x: 50 });
  });

  it('picks up edits made outside the game and ignores broken ones', async () => {
    const { dir, store } = await loaded();
    store.watch();
    try {
      const changed = nextToken(store);
      await writeFile(
        join(dir, 'tokens/goblin.json'),
        JSON.stringify({ id: 'goblin', name: 'Goblin', x: 950, y: 150 }),
      );
      expect((await changed).x).toBe(950);
      await writeFile(join(dir, 'tokens/goblin.json'), '{ broken');
      await new Promise((r) => setTimeout(r, 300));
      expect(store.tokens.get('goblin')!.x).toBe(950);
    } finally {
      store.close();
    }
  });

  it('refuses to start without a valid world.json', async () => {
    const { dir } = await loaded();
    await writeFile(join(dir, 'world.json'), '{}');
    await expect(new WorldStore(dir).load()).rejects.toThrow(/world.json is invalid/);
  });
});
