import { TokenSchema } from '@vtt/system-dnd5e';
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
      stats: { level: 1, abilities: { str: 10 } },
      inventory: [
        { item: 'backpack' },
        { item: 'rope' },
        { item: 'ring-of-protection', equipped: true },
        { item: 'cloak-of-protection', equipped: true, attuned: true },
        { item: 'ring-of-protection', attuned: true },
        { item: 'ring-of-protection', attuned: true },
      ],
    }),
  );
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

const hero = () => store.tokens.get('hero')!;

describe('what a player carries', () => {
  it('lets the owner count their coins', () => {
    join_('ana').receive({ t: 'carry', token: 'hero', change: { kind: 'coins', currency: { gp: 12, sp: 3 } } });
    expect(hero().currency).toEqual({ gp: 12, sp: 3 });
  });

  it('stows gear in a container and takes it out again', () => {
    const ana = join_('ana');
    ana.receive({ t: 'carry', token: 'hero', change: { kind: 'stow', item: 1, into: 0 } });
    expect(hero().inventory![1]!.in).toBe('backpack');
    ana.receive({ t: 'carry', token: 'hero', change: { kind: 'stow', item: 1, into: null } });
    expect(hero().inventory![1]!.in).toBeUndefined();
  });

  it("won't stow something in a thing that isn't a container", () => {
    const ana = join_('ana');
    ana.receive({ t: 'carry', token: 'hero', change: { kind: 'stow', item: 0, into: 1 } });
    expect(ana.take('error')[0]?.message).toMatch(/not a container/);
  });

  it('attunes up to three items, and the ring works once attuned', () => {
    const ana = join_('ana');
    ana.receive({ t: 'carry', token: 'hero', change: { kind: 'attune', item: 2, on: true } });
    expect(ana.take('error')[0]?.message).toMatch(/three/);
    ana.receive({ t: 'carry', token: 'hero', change: { kind: 'attune', item: 4, on: false } });
    ana.receive({ t: 'carry', token: 'hero', change: { kind: 'attune', item: 2, on: true } });
    expect(hero().inventory!.filter((e) => e.attuned)).toHaveLength(3);
    expect(hero().inventory![2]!.attuned).toBe(true);
  });

  it("doesn't let another player into the hero's pack", () => {
    const bo = join_('bo');
    bo.receive({ t: 'carry', token: 'hero', change: { kind: 'coins', currency: { gp: 999 } } });
    expect(hero().currency).toBeUndefined();
  });
});
