import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameStore } from '../store/game-store.ts';
import { startApi, type ApiServer } from '../test/api-server.ts';

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

const sorcerer = {
  name: 'Vex',
  rules: '2014',
  species: 'tiefling',
  class: 'sorcerer',
  subclass: 'draconic-bloodline',
  features: ['sorcerer/red'],
  background: 'acolyte',
  base: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 },
  skills: ['arcana', 'deception'],
  spells: ['fire-bolt', 'light', 'mage-hand', 'prestidigitation', 'magic-missile', 'shield'],
  proficiencyPicks: { 'background:languages': ['elvish', 'draconic'] },
};

const base = '/api/games/test/characters';

describe('characters', () => {
  it('belong to the player who made them, in their game', async () => {
    const ana = await api.joined('test', 'ana');
    const bo = await api.joined('test', 'bo');
    const made = await ana('POST', base, sorcerer);
    expect(made.status).toBe(200);
    const id = (made.json.character as Json).id as string;
    expect(id).toMatch(/^vex-/);
    expect(made.json.character).toMatchObject({ owner: 'ana', game: 'test' });
    expect((await ana('GET', base)).json.characters).toHaveLength(1);
    expect((await bo('GET', base)).json.characters).toHaveLength(0);
    expect((await bo('PUT', `${base}/${id}`, sorcerer)).status).toBe(404);
    expect((await bo('DELETE', `${base}/${id}`)).status).toBe(404);
    expect((await ana('DELETE', `${base}/${id}`)).status).toBe(200);
    expect((await ana('GET', base)).json.characters).toHaveLength(0);
  });

  it('refuses characters that break the rules, with the reasons', async () => {
    const ana = await api.joined('test', 'ana');
    const res = await ana('POST', base, { ...sorcerer, skills: [] });
    expect(res).toMatchObject({ status: 400, json: { issues: ['Choose 2 class skills.'] } });
    expect((await api.client()('GET', base)).status).toBe(401);
  });

  it('come onto the map as an actor the player owns', async () => {
    const ana = await api.joined('test', 'ana');
    const id = ((await ana('POST', base, sorcerer)).json.character as Json).id as string;
    expect((await ana('POST', '/api/games/test/bring', { character: id })).status).toBe(200);
    expect(store.tokens.get(id)).toMatchObject({
      name: 'Vex',
      actor: id,
      linked: true,
      ownership: { default: 'limited', ana: 'owner' },
      stats: { classes: [{ class: 'sorcerer', level: 1, subclass: 'draconic-bloodline' }] },
    });
    expect(store.actors.get(id)).toMatchObject({ name: 'Vex', ownership: { default: 'limited', ana: 'owner' } });
    const bo = await api.joined('test', 'bo');
    expect((await bo('POST', '/api/games/test/bring', { character: id })).status).toBe(404);
  });

  it("keep the GM's edits to their token when the player enters the game again", async () => {
    const ana = await api.joined('test', 'ana');
    const id = ((await ana('POST', base, sorcerer)).json.character as Json).id as string;
    await ana('POST', '/api/games/test/bring', { character: id });
    const look = { name: 'Vex the Red', img: '/assets/uploads/vex.png', size: 2, color: '#aa2222', speed: 40 };
    store.setToken({ ...store.tokens.get(id)!, ...look });
    expect((await ana('POST', '/api/games/test/bring', { character: id })).status).toBe(200);
    expect(store.tokens.get(id)).toMatchObject(look);
    expect(store.actors.get(id)).toMatchObject(look);
  });

  it('come back as their actor stands when their token left the map', async () => {
    const ana = await api.joined('test', 'ana');
    const id = ((await ana('POST', base, sorcerer)).json.character as Json).id as string;
    await ana('POST', '/api/games/test/bring', { character: id });
    store.setToken({ ...store.tokens.get(id)!, name: 'Vex the Red', img: '/assets/uploads/vex.png', hp: 2 });
    store.removeToken(id);
    await ana('POST', '/api/games/test/bring', { character: id });
    expect(store.tokens.get(id)).toMatchObject({ name: 'Vex the Red', img: '/assets/uploads/vex.png', hp: 2 });
  });

  it("keep the token's look when levelling up, unless the player changed it", async () => {
    const ana = await api.joined('test', 'ana');
    const id = ((await ana('POST', base, sorcerer)).json.character as Json).id as string;
    await ana('POST', '/api/games/test/bring', { character: id });
    store.setToken({ ...store.tokens.get(id)!, img: '/assets/uploads/vex.png', size: 2 });
    await ana('PUT', `${base}/${id}`, { ...sorcerer, name: 'Vex Prime', level: 2, hpRolls: [4] });
    expect(store.tokens.get(id)).toMatchObject({ name: 'Vex Prime', img: '/assets/uploads/vex.png', size: 2 });
  });

  it('level the token up with them, keeping its wounds and position', async () => {
    const ana = await api.joined('test', 'ana');
    const id = ((await ana('POST', base, sorcerer)).json.character as Json).id as string;
    await ana('POST', '/api/games/test/bring', { character: id });
    store.setToken({ ...store.tokens.get(id)!, x: 950, y: 950, hp: 3 });
    const res = await ana('PUT', `${base}/${id}`, {
      ...sorcerer,
      level: 2,
      hpRolls: [4],
      spells: [...sorcerer.spells, 'sleep'],
    });
    expect(res.status).toBe(200);
    expect(store.tokens.get(id)).toMatchObject({ x: 950, y: 950, hp: 3, stats: { classes: [{ level: 2 }] } });
  });
});
