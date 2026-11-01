import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ActorSchema, TokenSchema, type Token } from '@vtt/shared';
import { describe, expect, it, vi } from 'vitest';
import { GameStore } from './game-store.ts';
import { makeWorld } from './test/fixtures.ts';

async function loaded(): Promise<{ dir: string; store: GameStore }> {
  const dir = await makeWorld();
  const log = vi.spyOn(console, 'log').mockReturnValue();
  const store = new GameStore(dir);
  await store.load();
  log.mockRestore();
  return { dir, store };
}

const readJson = async (dir: string, rel: string): Promise<unknown> =>
  JSON.parse(await readFile(join(dir, rel), 'utf8'));
const entries = async (dir: string) => (await readJson(dir, 'scenes/main/tokens.json')) as Record<string, unknown>[];
const bandit = ActorSchema.parse({ id: 'bandit', name: 'Bandit', monster: 'bandit' });
const copy = (id: string, x: number): Token =>
  TokenSchema.parse({ ...bandit, id, x, y: 50, actor: 'bandit', linked: false });

describe('GameStore actors and tokens', () => {
  it('gives every creature on the map an actor when it loads an older game', async () => {
    const { dir, store } = await loaded();
    expect(store.actors.get('hero')).toMatchObject({ name: 'Hero', controllers: ['ana'] });
    expect(store.tokens.get('hero')).toMatchObject({ name: 'Hero', actor: 'hero', linked: true, x: 150 });
    expect(await readJson(dir, 'game.json')).toMatchObject({ format: 3 });
  });

  it('shares a linked token’s damage with its actor and every other token of it', async () => {
    const { dir, store } = await loaded();
    store.setToken({ ...store.tokens.get('hero')!, id: 'hero-echo', x: 250 });
    const seen: Token[] = [];
    store.on('token', (t) => seen.push(t));
    store.setToken({ ...store.tokens.get('hero')!, hp: 3 });
    expect(store.tokens.get('hero-echo')!.hp).toBe(3);
    expect(seen.map((t) => t.id).sort((a, b) => a.localeCompare(b))).toEqual(['hero', 'hero-echo']);
    await store.flush();
    expect(await readJson(dir, 'actors/hero.json')).toMatchObject({ hp: 3 });
    expect((await entries(dir)).find((e) => e.id === 'hero')).toEqual({
      id: 'hero',
      x: 150,
      y: 150,
      actor: 'hero',
      linked: true,
    });
  });

  it('keeps an unlinked copy’s damage to itself, in its delta', async () => {
    const { dir, store } = await loaded();
    store.setActor(bandit);
    store.setToken(copy('bandit-1', 50));
    store.setToken(copy('bandit-2', 150));
    store.setToken({ ...store.tokens.get('bandit-1')!, hp: 2 });
    expect(store.tokens.get('bandit-2')!.hp).toBeUndefined();
    expect(store.actors.get('bandit')!.hp).toBeUndefined();
    await store.flush();
    expect((await entries(dir)).find((e) => e.id === 'bandit-1')).toMatchObject({ delta: { hp: 2 } });
  });

  it('updates the tokens of an actor the GM edits', async () => {
    const { store } = await loaded();
    store.setActor(bandit);
    store.setToken(copy('bandit-1', 50));
    store.setActor({ ...bandit, size: 2 });
    expect(store.tokens.get('bandit-1')!.size).toBe(2);
  });

  it('follows an actor file edited by hand', async () => {
    const { dir, store } = await loaded();
    store.watch();
    try {
      const changed = new Promise<Token>((resolve) => store.once('token', resolve));
      const hero = (await readJson(dir, 'actors/hero.json')) as object;
      await writeFile(join(dir, 'actors/hero.json'), JSON.stringify({ ...hero, name: 'Heroine' }));
      expect(await changed).toMatchObject({ id: 'hero', name: 'Heroine' });
    } finally {
      store.close();
    }
  });

  it('leaves a deleted actor’s tokens carrying their own sheet', async () => {
    const { dir, store } = await loaded();
    store.setToken({ ...store.tokens.get('hero')!, hp: 4 });
    store.removeActor('hero');
    expect(store.tokens.get('hero')).toMatchObject({ name: 'Hero', hp: 4, linked: false });
    expect(store.tokens.get('hero')!.actor).toBeUndefined();
    await store.flush();
    expect((await entries(dir)).find((e) => e.id === 'hero')).toMatchObject({ name: 'Hero', hp: 4 });
  });

  it('leaves out a token whose actor is missing, and says so', async () => {
    const { dir } = await loaded();
    const list = await entries(dir);
    await writeFile(
      join(dir, 'scenes/main/tokens.json'),
      JSON.stringify([...list, { id: 'x', x: 0, y: 0, actor: 'nobody' }]),
    );
    const error = vi.spyOn(console, 'error').mockReturnValue();
    const store = new GameStore(dir);
    await store.load();
    expect(store.tokens.has('x')).toBe(false);
    expect(error.mock.calls.flat().join(' ')).toMatch(/token "x".*unknown actor "nobody"/);
    error.mockRestore();
  });

  it('unlinks, saves to the actor, resets and links a token', async () => {
    const { store } = await loaded();
    store.relinkToken('hero', 'unlink');
    store.setToken({ ...store.tokens.get('hero')!, hp: 1, speed: 40 });
    expect(store.actors.get('hero')!.hp).toBeUndefined();
    store.relinkToken('hero', 'save');
    expect(store.actors.get('hero')!.speed).toBe(40);
    expect(store.tokens.get('hero')!.hp).toBe(1);
    store.relinkToken('hero', 'reset');
    expect(store.tokens.get('hero')!.hp).toBeUndefined();
    store.setToken({ ...store.tokens.get('hero')!, hp: 2 });
    store.relinkToken('hero', 'link');
    expect(store.tokens.get('hero')).toMatchObject({ linked: true, speed: 40 });
    expect(store.tokens.get('hero')!.hp).toBeUndefined();
  });
});
