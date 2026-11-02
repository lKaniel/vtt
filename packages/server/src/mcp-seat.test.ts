import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { act, look } from './mcp-seat.ts';
import { makeWorld } from './test/fixtures.ts';

// Claude at the table: a seat with no browser, which looks and acts with
// exactly the rights of the player it sits for.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0 });
});

afterEach(async () => {
  await store.flush();
});

describe('a bridge seat', () => {
  it('sees what its player sees', async () => {
    const gm = await look(game, game.findPlayer('gm')!);
    const ana = await look(game, game.findPlayer('ana')!);
    expect(gm.you.role).toBe('gm');
    expect(gm.tokens.length).toBeGreaterThan(ana.tokens.length);
  });

  it('acts, and hears back what went wrong', async () => {
    const replies = await act(game, game.findPlayer('gm')!, [{ t: 'chat', text: 'Hello from Claude' }]);
    expect(replies.filter((m) => m.t === 'chat').map((m) => m.message.text)).toEqual(['Hello from Claude']);
    const refused = await act(game, game.findPlayer('ana')!, [
      { t: 'ops', txn: 'x', ops: [{ op: 'delete', coll: 'actors', id: 'nobody' }] },
    ]);
    expect(refused.find((m) => m.t === 'reject')).toBeDefined();
  });
});
