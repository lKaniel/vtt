import { type ChatMessage, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      stats: { class: 'rogue', level: 5, abilities: { dex: 16 }, skills: ['stealth'] },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), monster: 'goblin' }));
});

afterEach(async () => {
  await store.flush();
});

function join_(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.take('welcome');
  return ws;
}

const cards = (ws: FakeSocket): ChatMessage[] => ws.take('chat').map((m) => m.message);

describe('checks', () => {
  it('are rolled by a creature’s owner from its sheet', () => {
    const ana = join_('ana');
    ana.receive({ t: 'rollCheck', token: 'hero', ability: 'dex', skill: 'stealth' });
    expect(cards(ana).at(-1)?.check).toMatchObject({ kind: 'each', entries: [{ token: 'hero', total: 17 }] });
    ana.receive({ t: 'rollCheck', token: 'goblin', ability: 'dex' });
    expect(ana.take('error')[0]?.message).toMatch(/No such/);
  });

  it('are asked for by the GM, and each owner rolls on the request card', () => {
    const gm = join_('gm');
    gm.receive({
      t: 'requestCheck',
      tokens: ['hero', 'goblin'],
      ability: 'dex',
      skill: 'stealth',
      dc: 15,
      kind: 'group',
    });
    const card = cards(gm).at(-1)!;
    expect(card.check).toMatchObject({ kind: 'group', dc: 15, entries: [{ token: 'hero' }, { token: 'goblin' }] });
    const ana = join_('ana');
    ana.receive({ t: 'requestCheck', tokens: ['hero'], ability: 'str', kind: 'each' });
    expect(ana.take('error')[0]?.message).toMatch(/GM/);
    ana.receive({ t: 'rollCheck', token: 'hero', ability: 'dex', card: card.id });
    expect(cards(gm).at(-1)?.check?.entries[0]).toMatchObject({ total: 17, success: true });
    ana.receive({ t: 'rollCheck', token: 'hero', ability: 'dex', card: card.id });
    expect(ana.take('error')[0]?.message).toMatch(/already/);
    gm.receive({ t: 'rollCheck', token: 'goblin', ability: 'dex', card: card.id });
    // Goblin: Dex 14 (no skills in its stat block here) → 13, a failure; one of two is half.
    expect(cards(gm).at(-1)?.check).toMatchObject({ outcome: 'The group succeeds' });
  });

  it('settle a contest with the second creature’s own skill', () => {
    const gm = join_('gm');
    gm.receive({
      t: 'requestCheck',
      tokens: ['goblin', 'hero'],
      ability: 'str',
      skill: 'athletics',
      kind: 'contest',
      versus: { ability: 'dex', skill: 'acrobatics' },
    });
    const card = cards(gm).at(-1)!;
    gm.receive({ t: 'rollCheck', token: 'goblin', ability: 'str', card: card.id });
    join_('ana').receive({ t: 'rollCheck', token: 'hero', ability: 'dex', card: card.id });
    // Goblin: 11 - 1 = 10; Hero: 11 + 3 = 14.
    expect(cards(gm).at(-1)?.check).toMatchObject({ outcome: 'Hero wins', entries: [{ total: 10 }, { total: 14 }] });
  });
});
