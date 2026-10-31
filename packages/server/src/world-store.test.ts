import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ActorSchema, type Token } from '@vtt/shared';
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

  it('deletes a removed token and its file', async () => {
    const { dir, store } = await loaded();
    const gone = new Promise((resolve) => store.once('tokenGone', resolve));
    store.removeToken('goblin');
    expect(await gone).toBe('goblin');
    await store.flush();
    await expect(readFile(join(dir, 'tokens/goblin.json'), 'utf8')).rejects.toThrow();
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

describe('WorldStore actors', () => {
  it('loads actors/ and writes and deletes actor files', async () => {
    const { dir, store } = await loaded();
    store.setActor({
      id: 'bandit',
      name: 'Bandit',
      size: 1,
      color: '#b04a3a',
      speed: 30,
      controllers: [],
      darkvision: 0,
      hidden: false,
      folder: 'Road',
    });
    await store.flush();
    const again = new WorldStore(dir);
    await again.load();
    expect(again.actors.get('bandit')).toMatchObject({ name: 'Bandit', folder: 'Road' });
    again.removeActor('bandit');
    await again.flush();
    await expect(readFile(join(dir, 'actors/bandit.json'), 'utf8')).rejects.toThrow();
  });
});

describe('WorldStore forgetting deleted files', () => {
  it('drops a token or actor whose file was deleted by hand', async () => {
    const { dir, store } = await loaded();
    store.setActor(ActorSchema.parse({ id: 'bandit', name: 'Bandit' }));
    await store.flush();
    store.watch();
    try {
      const tokenGone = new Promise((resolve) => store.once('tokenGone', resolve));
      const actorGone = new Promise((resolve) => store.once('actorGone', resolve));
      await rm(join(dir, 'tokens/goblin.json'));
      await rm(join(dir, 'actors/bandit.json'));
      expect(await tokenGone).toBe('goblin');
      expect(await actorGone).toBe('bandit');
    } finally {
      store.close();
    }
  });
});
