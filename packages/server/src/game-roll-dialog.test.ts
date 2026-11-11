// What the roll dialog sends with an action (session-roll-dialog.ts on the
// client): the d20 rolled exactly as picked, a situational modifier, extra
// or set damage, what the action spends of the turn, and the default the
// dialog shows before the roll.
import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];
const face = (n: number, sides = 20) => (n - 1) / sides + 0.001;
const tok = (id: string): Token => store.tokens.get(id)!;
const POISONED = { id: 'poison', name: 'Poisoned', conditions: ['poisoned' as const] };

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(
    TokenSchema.parse({
      id: 'bo',
      name: 'Fighter',
      x: 150,
      y: 150,
      ownership: { default: 'limited', bo: 'owner' },
      darkvision: 60,
      stats: {
        class: 'wizard',
        level: 5,
        maxHp: 40,
        abilities: { str: 16, dex: 10, int: 16 },
        spells: ['fire-bolt', 'misty-step'],
      },
      inventory: [{ item: 'longsword', equipped: true }],
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 250, y: 150, monster: 'goblin' }));
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

/** Starts a fight with Bo first. */
function fight(): void {
  dice = [face(20), face(2)];
  join_('gm').receive({ t: 'combatStart', tokens: ['bo', 'goblin'] });
}

const swing = { t: 'attack', attacker: 'bo', target: 'goblin', attack: 'Longsword' };

describe('an attack as the roll dialog sends it', () => {
  it('rolls the d20 as picked, whatever a poison gives', () => {
    store.setToken({ ...tok('bo'), effects: [POISONED] });
    const bo = join_('bo');
    // Disadvantage would keep the 2; picked normal rolls one d20, a 15.
    dice = [face(15), face(2)];
    bo.receive({ ...swing, d20: 'normal' });
    expect(bo.take('error')).toEqual([]);
    expect(tok('goblin').hp).toBeLessThan(7);
  });

  it('adds the situational modifier to the roll', () => {
    const bo = join_('bo');
    // 11 + 3 misses AC 15; + 1d4 (a 1) hits.
    dice = [face(11), face(1, 4)];
    bo.receive({ ...swing, situational: '1d4' });
    expect(tok('goblin').hp).toBeLessThan(7);
  });

  it('deals the damage set, and says so', () => {
    const bo = join_('bo');
    dice = [face(15)];
    bo.receive({ ...swing, damageSet: 4 });
    expect(tok('goblin').hp).toBe(3);
    const [card] = bo.take('chat');
    expect(card?.message.attack?.notes).toContain('damage set to 4');
  });

  it('spends what the player picked of the turn', () => {
    const bo = join_('bo');
    fight();
    bo.receive({ ...swing, spend: 'bonus' });
    expect(store.combat!.left).toMatchObject({ action: true, bonus: false });
    bo.receive({ ...swing, spend: 'free' });
    expect(store.combat!.left).toMatchObject({ action: true, bonus: false });
    bo.receive({ ...swing, spend: 'reaction' });
    expect(store.combat!.reacted).toEqual(['bo']);
    bo.receive({ ...swing, spend: 'bonus' });
    expect(bo.take('error')[0]?.message).toMatch(/bonus action/);
  });
});

describe('a spell as the roll dialog sends it', () => {
  const bolt = { t: 'cast', caster: 'bo', spell: 'fire-bolt', slot: 0, targets: ['goblin'] };

  it('takes the d20, the modifier and the damage picked', () => {
    store.setToken({ ...tok('bo'), effects: [POISONED] });
    const bo = join_('bo');
    // 8 + 6 hits AC 15 only with the +1, and only as the one d20 picked (a second die would be a 1).
    dice = [face(8), face(1)];
    bo.receive({ ...bolt, d20: 'normal', situational: '+1', damageSet: 5 });
    expect(bo.take('error')).toEqual([]);
    expect(tok('goblin').hp).toBe(2);
  });

  it('is cast as the action the player picked', () => {
    const bo = join_('bo');
    fight();
    bo.receive({ ...bolt, spend: 'bonus' });
    expect(store.combat!.left).toMatchObject({ action: true, bonus: false });
    bo.receive({
      t: 'cast',
      caster: 'bo',
      spell: 'misty-step',
      slot: 2,
      targets: [],
      point: [150, 250],
      spend: 'free',
    });
    expect(bo.take('error')).toEqual([]);
    expect(store.combat!.left).toMatchObject({ action: true, bonus: false });
  });
});

describe('a check as the roll dialog sends it', () => {
  it('rolls as picked with the modifier', () => {
    store.setToken({ ...tok('bo'), effects: [POISONED] });
    const bo = join_('bo');
    dice = [face(10)];
    bo.receive({ t: 'rollCheck', token: 'bo', ability: 'str', d20: 'normal', situational: '+2' });
    const [card] = bo.take('chat');
    expect(card?.message.check?.entries[0]).toMatchObject({ total: 15 });
    expect(card?.message.check?.entries[0]?.roll?.formula).toBe('1d20+3+2');
  });
});

describe('the default roll the dialog shows', () => {
  it('is the disadvantage a poisoned creature attacks and checks with', () => {
    store.setToken({ ...tok('bo'), effects: [POISONED] });
    const bo = join_('bo');
    bo.receive({
      t: 'rollDefaults',
      ref: 'a',
      roll: { kind: 'attack', attacker: 'bo', target: 'goblin', attack: 'Longsword' },
    });
    bo.receive({ t: 'rollDefaults', ref: 'b', roll: { kind: 'check', token: 'bo', ability: 'str' } });
    bo.receive({
      t: 'rollDefaults',
      ref: 'c',
      roll: { kind: 'spell', caster: 'bo', spell: 'fire-bolt', target: 'goblin' },
    });
    expect(bo.take('rollDefaults')).toEqual([
      { t: 'rollDefaults', ref: 'a', d20: 'disadvantage' },
      { t: 'rollDefaults', ref: 'b', d20: 'disadvantage' },
      { t: 'rollDefaults', ref: 'c', d20: 'disadvantage' },
    ]);
  });

  it('is normal with nothing in the way, and only for your own creature', () => {
    const bo = join_('bo');
    bo.receive({ t: 'rollDefaults', ref: 'a', roll: { kind: 'check', token: 'bo', ability: 'wis', save: true } });
    expect(bo.take('rollDefaults')).toEqual([{ t: 'rollDefaults', ref: 'a', d20: 'normal' }]);
    bo.receive({ t: 'rollDefaults', ref: 'b', roll: { kind: 'check', token: 'goblin', ability: 'wis' } });
    expect(bo.take('rollDefaults')).toEqual([]);
  });
});
