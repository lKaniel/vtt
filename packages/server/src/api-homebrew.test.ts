import type { Doc } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameStore } from './game-store.ts';
import { startApi, type ApiServer } from './test/api-server.ts';

// The GM's homebrew classes in the account character creator: an account is
// offered those of the games it sits in that it may read, and a saved
// character carries the game's current copy of each one it takes.

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
  const gm = api.client();
  const ana = api.client();
  await gm('POST', '/api/register', { username: 'kaniel', password: 'hunter22', name: 'Kaniel' });
  await gm('POST', '/api/games/test/join', {});
  await ana('POST', '/api/register', { username: 'ana', password: 'hunter22', name: 'Ana' });
  await ana('POST', '/api/games/test/join', {});
  store.applyOps([{ op: 'create', coll: 'homebrew', doc: illusionist as unknown as Doc }]);
  return { gm, ana };
}

const share = () =>
  store.applyOps([
    { op: 'update', coll: 'homebrew', id: 'illusionist', patch: { ownership: { default: 'observer' } } },
  ]);

describe('homebrew classes for the roster', () => {
  it('are offered from the games the account sits in, once the GM shares them', async () => {
    const { gm, ana } = await seated();
    const names = async (call: typeof gm) =>
      ((await call('GET', '/api/homebrew')).json.classes as Json[]).map((c) => c.name);
    expect(await names(gm)).toEqual(['Illusionist']);
    expect(await names(ana)).toEqual([]);
    share();
    expect(await names(ana)).toEqual(['Illusionist']);
  });

  it('are saved on a character as the game has them', async () => {
    const { ana } = await seated();
    share();
    const fake = { ...illusionist, name: 'Archmage', hitDie: 12 };
    const res = await ana('POST', '/api/characters', { ...nyx, homebrew: [fake] });
    expect(res.status).toBe(200);
    expect((res.json.character as { homebrew: Json[] }).homebrew).toEqual([
      expect.objectContaining({ name: 'Illusionist', hitDie: 8 }),
    ]);
  });

  it('refuse a class the account was not given', async () => {
    const { ana } = await seated();
    const res = await ana('POST', '/api/characters', { ...nyx, homebrew: [illusionist] });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/Illusionist/);
  });
});
