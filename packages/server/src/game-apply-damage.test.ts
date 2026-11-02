import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Applying a roll from chat to creatures: in full, half, double, or as
// healing; its damage type meets resistances; one undo step.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), monster: 'goblin' }));
  store.setToken(TokenSchema.parse({ ...store.tokens.get('hero'), monster: 'skeleton' }));
  game = new Game(store, { rng: () => 0.5 });
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

/** Rolls `text` in chat and returns the card's id. */
function rollCard(ws: FakeSocket, text: string): string {
  ws.receive({ t: 'chat', text });
  return ws.take('chat').at(-1)!.message.id;
}

const hp = (id: string) => store.tokens.get(id)!.hp;

describe('applying a roll from chat', () => {
  it('reads a damage type after the formula', () => {
    const gm = seat('gm');
    gm.receive({ t: 'chat', text: '/r 2d6 + 1 fire' });
    const [card] = gm.take('chat');
    expect(card?.message.roll?.formula).toBe('2d6 + 1');
    expect(card?.message.label).toBe('fire');
  });

  it('deals the total to each creature, in full, half or double', () => {
    const gm = seat('gm');
    const card = rollCard(gm, '/r 4');
    gm.receive({ t: 'applyDamage', card, tokens: ['goblin'], how: 'half' });
    expect(hp('goblin')).toBe(5);
    gm.receive({ t: 'applyDamage', card, tokens: ['goblin'], how: 'full' });
    expect(hp('goblin')).toBe(1);
    expect(gm.take('chat').at(-1)?.message.text).toMatch(/Goblin takes 4/);
  });

  it('heals instead, up to the creature’s maximum', () => {
    const gm = seat('gm');
    const card = rollCard(gm, '/r 4');
    gm.receive({ t: 'applyDamage', card, tokens: ['goblin'], how: 'double' });
    expect(hp('goblin')).toBe(0);
    gm.receive({ t: 'applyDamage', card, tokens: ['goblin'], how: 'heal' });
    expect(hp('goblin')).toBe(4);
    gm.receive({ t: 'applyDamage', card, tokens: ['goblin'], how: 'heal' });
    expect(hp('goblin')).toBeUndefined();
  });

  it('meets resistances, immunities and vulnerabilities through the damage type', () => {
    const gm = seat('gm');
    gm.receive({ t: 'applyDamage', card: rollCard(gm, '/r 4 poison'), tokens: ['hero'], how: 'full' });
    expect(hp('hero')).toBeUndefined();
    gm.receive({ t: 'applyDamage', card: rollCard(gm, '/r 4 bludgeoning'), tokens: ['hero'], how: 'full' });
    expect(hp('hero')).toBe(13 - 8);
  });

  it('is one step the GM can undo', () => {
    const gm = seat('gm');
    const card = rollCard(gm, '/r 4');
    gm.receive({ t: 'applyDamage', card, tokens: ['goblin', 'hero'], how: 'full' });
    gm.receive({ t: 'undo' });
    expect(hp('goblin')).toBeUndefined();
    expect(hp('hero')).toBeUndefined();
  });

  it('lets a player apply only rolls they can read, to creatures they control', () => {
    const [ana, bo] = [seat('ana'), seat('bo')];
    const card = rollCard(ana, '/r 4');
    ana.receive({ t: 'applyDamage', card, tokens: ['goblin'], how: 'full' });
    expect(ana.take('error')).toHaveLength(1);
    expect(hp('goblin')).toBeUndefined();
    const secret = rollCard(bo, '/sr 4');
    ana.receive({ t: 'applyDamage', card: secret, tokens: ['hero'], how: 'full' });
    expect(ana.take('error')).toHaveLength(1);
    ana.receive({ t: 'applyDamage', card, tokens: ['hero'], how: 'full' });
    expect(hp('hero')).toBe(9);
  });

  it('needs a roll to apply', () => {
    const gm = seat('gm');
    gm.receive({ t: 'chat', text: 'hello' });
    const card = gm.take('chat')[0]!.message.id;
    gm.receive({ t: 'applyDamage', card, tokens: ['goblin'], how: 'full' });
    expect(gm.take('error')[0]?.message).toMatch(/no roll/i);
  });
});
