import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Auras on the table: the hero is a 6th-level paladin in the middle of the
// test room (150, 150); their squire (Bo's) stands outside it, 20 ft east.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      stats: { class: 'paladin', level: 6, abilities: { cha: 16 } },
    }),
  );
  const squire = { id: 'squire', type: 'token', rev: 0, name: 'Squire', x: 550, y: 150, stats: { level: 1 } };
  store.applyOps([
    { op: 'create', coll: 'main/tokens', doc: { ...squire, ownership: { default: 'limited', bo: 'owner' } } },
  ]);
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.sent = [];
  return ws;
}

const auraNames = (id: string) => (store.tokens.get(id)?.effects ?? []).filter((e) => e.auraFrom).map((e) => e.name);
const place = (gm: FakeSocket, id: string, patch: Record<string, unknown>) =>
  gm.receive({ t: 'ops', txn: 't', ops: [{ op: 'update', coll: 'main/tokens', id, patch }] });

describe('auras', () => {
  it('land on an ally who comes within reach, in the same undo step, and leave with them', () => {
    const gm = seat('gm');
    place(gm, 'squire', { x: 450 });
    expect(auraNames('squire')).toEqual([]);
    place(gm, 'squire', { x: 350 });
    expect(auraNames('squire')).toEqual(['Aura of Protection']);
    expect(auraNames('hero')).toEqual(['Aura of Protection']);
    gm.receive({ t: 'undo' });
    expect(store.tokens.get('squire')).toMatchObject({ x: 450 });
    expect(auraNames('squire')).toEqual([]);
  });

  it('go when the paladin drops', () => {
    const gm = seat('gm');
    place(gm, 'squire', { x: 350 });
    gm.receive({ t: 'editToken', token: 'hero', patch: { hp: 0 } });
    expect(auraNames('squire')).toEqual([]);
    expect(auraNames('hero')).toEqual([]);
  });
});
