import type { Doc } from '@vtt/core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameStore } from '../store/game-store.ts';
import { startApi, type ApiServer } from '../test/api-server.ts';

// The GM's homebrew classes in the character creator: a player is offered
// those of their game they may read, and a saved character carries the
// game's current copy of each one it takes.

let api: ApiServer;
let store: GameStore;

beforeEach(async () => {
  api = await startApi();
  ({ store } = await api.hub.open('test'));
});

afterEach(async () => {
  await api.close();
});

type Json = Record<string, unknown>;

const illusionist = {
  id: 'illusionist',
  type: 'homebrew',
  rev: 0,
  kind: 'class',
  name: 'Illusionist',
  hitDie: 8,
  saves: ['int', 'wis'],
  features: [],
};

const nyx = {
  name: 'Nyx',
  rules: '2014',
  species: 'human',
  class: 'illusionist',
  background: 'acolyte',
  base: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
  skills: ['arcana', 'stealth'],
};

async function seated() {
  const gm = await api.joined('test', 'gm');
  const ana = await api.joined('test', 'ana');
  store.applyOps([{ op: 'create', coll: 'homebrew', doc: illusionist as unknown as Doc }]);
  return { gm, ana };
}

const share = () =>
  store.applyOps([
    { op: 'update', coll: 'homebrew', id: 'illusionist', patch: { ownership: { default: 'observer' } } },
  ]);

describe('homebrew classes for the roster', () => {
  it("are offered from the player's game, once the GM shares them", async () => {
    const { gm, ana } = await seated();
    const names = async (call: typeof gm) =>
      ((await call('GET', '/api/games/test/homebrew')).json.classes as Json[]).map((c) => c.name);
    expect(await names(gm)).toEqual(['Illusionist']);
    expect(await names(ana)).toEqual([]);
    share();
    expect(await names(ana)).toEqual(['Illusionist']);
  });

  it('are saved on a character as the game has them', async () => {
    const { ana } = await seated();
    share();
    const fake = { ...illusionist, name: 'Archmage', hitDie: 12 };
    const res = await ana('POST', '/api/games/test/characters', { ...nyx, homebrew: [fake] });
    expect(res.status).toBe(200);
    expect((res.json.character as { homebrew: Json[] }).homebrew).toEqual([
      expect.objectContaining({ name: 'Illusionist', hitDie: 8 }),
    ]);
  });

  it('refuse a class the player was not given', async () => {
    const { ana } = await seated();
    const res = await ana('POST', '/api/games/test/characters', { ...nyx, homebrew: [illusionist] });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/Illusionist/);
  });
});

describe('classes from the server’s packs', () => {
  async function housePack(everyGame: boolean) {
    const dir = join(api.dataDir, 'packs', 'house');
    await mkdir(dir, { recursive: true });
    const compendia = [{ id: 'classes', type: 'class', path: 'classes.json' }];
    await writeFile(
      join(dir, 'pack.json'),
      JSON.stringify({ id: 'house', name: 'House', system: 'dnd5e', everyGame, compendia }),
    );
    const { type: _t, rev: _r, kind: _k, ...cls } = illusionist;
    await writeFile(join(dir, 'classes.json'), JSON.stringify([cls]));
    await api.hub.packs.load();
  }
  const names = async (call: Awaited<ReturnType<typeof seated>>['ana']) =>
    ((await call('GET', '/api/games/test/homebrew')).json.classes as Json[]).map((c) => c.name);

  it('offers the classes of a pack that is on in every game', async () => {
    await housePack(true);
    const ana = await api.joined('test', 'ana');
    expect(await names(ana)).toEqual(['Illusionist']);
    const res = await ana('POST', '/api/games/test/characters', { ...nyx, homebrew: [illusionist] });
    expect(res.status).toBe(200);
  });

  it('offers nothing from a pack the game doesn’t use', async () => {
    await housePack(false);
    const ana = await api.joined('test', 'ana');
    expect(await names(ana)).toEqual([]);
  });
});
