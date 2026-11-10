import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];

const d20 = (face: number) => (face - 1) / 20 + 0.001;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 650,
      y: 150,
      stats: { class: 'fighter', level: 5, maxHp: 50, abilities: { str: 18 }, skills: ['athletics'] },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 550, y: 150, monster: 'goblin' }));
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

/** A fight where the hero goes first. */
function fight(): { gm: FakeSocket; ana: FakeSocket } {
  const gm = join_('gm');
  const ana = join_('ana');
  dice = [d20(20), d20(2)];
  gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
  expect(store.combat!.order[store.combat!.turn]!.token).toBe('hero');
  return { gm, ana };
}

const goblin = () => store.tokens.get('goblin')!;
const conditions = () => (goblin().effects ?? []).flatMap((e) => e.conditions ?? []);
const chat = (ws: FakeSocket) => ws.take('chat').map((m) => JSON.stringify(m));

describe('Grapple', () => {
  it('grapples a creature that loses the contest, in place of one attack', () => {
    const { ana } = fight();
    dice = [d20(15), d20(5)];
    ana.receive({ t: 'feature', token: 'hero', feature: 'grapple', targets: ['goblin'] });
    // The card says a feature was used and a check made, not a spell cast and a save.
    const card = chat(ana).find((m) => m.includes('Grapple'))!;
    expect(conditions()).toContain('grappled');
    expect(card).toContain('"feature":true');
    expect(card).toContain('"check":true');
    // A level 5 fighter has two attacks: one is left after the grapple, then none.
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Unarmed Strike' });
    expect(ana.take('error')).toEqual([]);
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Unarmed Strike' });
    expect(ana.take('error')[0]?.message).toMatch(/already used/);
  });

  it('leaves a creature that wins the contest free', () => {
    const { ana } = fight();
    dice = [d20(2), d20(19)];
    ana.receive({ t: 'feature', token: 'hero', feature: 'grapple', targets: ['goblin'] });
    expect(conditions()).not.toContain('grappled');
  });

  it("can't seize a creature more than one size larger", () => {
    const { ana } = fight();
    store.setToken({ ...goblin(), size: 3 });
    ana.receive({ t: 'feature', token: 'hero', feature: 'grapple', targets: ['goblin'] });
    expect(ana.take('error')[0]?.message).toMatch(/too big/);
    expect(store.combat!.left.action).toBe(true);
  });
});

describe('Shove', () => {
  it('knocks the loser prone', () => {
    const { ana } = fight();
    dice = [d20(15), d20(5)];
    ana.receive({ t: 'feature', token: 'hero', feature: 'shove', targets: ['goblin'], choice: 'prone' });
    expect(ana.take('error')).toEqual([]);
    expect(conditions()).toContain('prone');
  });

  it('or pushes it 5 feet away', () => {
    const { ana } = fight();
    dice = [d20(15), d20(5)];
    ana.receive({ t: 'feature', token: 'hero', feature: 'shove', targets: ['goblin'], choice: 'push' });
    expect(ana.take('error')).toEqual([]);
    expect(goblin().x).toBeLessThan(550);
  });
});

describe('Hide', () => {
  it('rolls Stealth and tells the table the total', () => {
    const { ana } = fight();
    dice = [d20(12)];
    ana.receive({ t: 'feature', token: 'hero', feature: 'hide' });
    expect(chat(ana).some((m) => m.includes('Hero uses Hide: Stealth 12'))).toBe(true);
    expect(store.tokens.get('hero')!.effects?.some((e) => e.name === 'Hidden')).toBe(true);
  });
});

describe('Help', () => {
  it('gives a creature within 5 feet advantage on its next attack', () => {
    const { ana } = fight();
    ana.receive({ t: 'feature', token: 'hero', feature: 'help', targets: ['goblin'] });
    expect(ana.take('error')).toEqual([]);
    expect(goblin().effects?.some((e) => e.name === 'Helped' && e.advantage)).toBe(true);
  });
});
