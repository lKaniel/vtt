import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Lasting zones (spirit guardians, moonbeam) are templates on the map: the
// template appears with the spell, follows a caster it surrounds, goes with
// the spell, and the zone is where the template is, so the GM can move it.

let store: GameStore;
let game: Game;
let dice: number[];
const face = (n: number, sides = 20) => (n - 1) / sides + 0.001;
const tok = (id: string): Token => store.tokens.get(id)!;
const templates = () => store.docs.all('main/templates');

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 50,
      y: 50,
      darkvision: 60,
      stats: { class: 'cleric', level: 5, maxHp: 30, abilities: { wis: 16 }, spells: ['spirit-guardians', 'moonbeam'] },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 250, y: 250, monster: 'goblin' }));
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

function fight(): { ana: FakeSocket; gm: FakeSocket } {
  const ana = seat('ana');
  const gm = seat('gm');
  dice = [face(20), face(5)];
  gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
  return { ana, gm };
}

describe('lasting zones as templates', () => {
  it('put a template round a caster that keeps up spirit guardians, which follows them and goes with the spell', () => {
    const { ana } = fight();
    ana.receive({ t: 'cast', caster: 'hero', spell: 'spirit-guardians', slot: 3, targets: [] });
    expect(templates()).toMatchObject([
      { shape: 'circle', x: 50, y: 50, distance: 17.5, attachedTo: 'hero', effect: { token: 'hero' } },
    ]);
    ana.receive({ t: 'move', token: 'hero', to: [150, 150] });
    expect(templates()[0]).toMatchObject({ x: 150, y: 150 });
    ana.receive({ t: 'dropConcentration', token: 'hero' });
    expect(templates()).toEqual([]);
  });

  it('put a moonbeam where it was aimed, and hurt what walks into the template where the GM moved it', () => {
    const { ana, gm } = fight();
    ana.receive({ t: 'cast', caster: 'hero', spell: 'moonbeam', slot: 2, targets: [], point: [50, 250] });
    const [beam] = templates();
    expect(beam).toMatchObject({ shape: 'circle', x: 50, y: 250, distance: 5 });
    ana.receive({ t: 'endTurn' });
    gm.receive({
      t: 'ops',
      txn: 't',
      ops: [{ op: 'update', coll: 'main/templates', id: beam!.id, patch: { x: 250, y: 50 } }],
    });
    // The goblin fails its Con save (1) and takes 2d10 of 1s.
    dice = [face(1), face(1, 10), face(1, 10)];
    gm.receive({ t: 'move', token: 'goblin', to: [250, 50] });
    expect(tok('goblin').hp).toBe(5);
  });

  it('undo with the spell', () => {
    const { ana } = fight();
    ana.receive({ t: 'cast', caster: 'hero', spell: 'moonbeam', slot: 2, targets: [], point: [150, 250] });
    expect(templates()).toHaveLength(1);
    seat('gm').receive({ t: 'undo' });
    expect(templates()).toEqual([]);
  });
});
