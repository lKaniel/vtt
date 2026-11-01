import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

let dir: string;
let store: GameStore;
let game: Game;
/** What the next random numbers will be; 0.5 (a d20 of 11) once they run out. */
let dice: number[];

beforeEach(async () => {
  dir = await makeWorld();
  store = new GameStore(dir);
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  // The hero sees in the dark, wields a longsword and has a goblin next to them.
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      darkvision: 60,
      stats: { level: 1, maxHp: 12, abilities: { str: 16, dex: 10 } },
      inventory: [{ item: 'longsword', equipped: true }, { item: 'dagger' }],
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 250, y: 150, monster: 'goblin' }));
});

afterEach(async () => {
  await store.flush();
});

/** A d20 face as the rng value that rolls it. */
const d20 = (face: number) => (face - 1) / 20 + 0.001;

function join_(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.take('welcome');
  return ws;
}

/** Starts a fight with the hero going first. */
function fight(): { ana: FakeSocket; gm: FakeSocket } {
  const ana = join_('ana');
  const gm = join_('gm');
  dice = [d20(20), d20(2)];
  gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
  ana.sent = [];
  gm.sent = [];
  return { ana, gm };
}

describe('starting and ending combat', () => {
  it('rolls initiative, tells everyone and saves combat.json', async () => {
    const { ana } = fight();
    expect(store.combat?.order.map((e) => e.token)).toEqual(['hero', 'goblin']);
    await store.flush();
    const saved = JSON.parse(await readFile(join(dir, 'combat.json'), 'utf8')) as { round: number };
    expect(saved.round).toBe(1);
    game.connect(ana.asWebSocket, game.findPlayer('ana')!);
    expect(ana.take('welcome')[0]!.combat?.order).toHaveLength(2);
  });

  it('announces the initiative order in chat', () => {
    const ana = join_('ana');
    dice = [d20(20), d20(2)];
    join_('gm').receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    expect(ana.take('chat')[0]!.message.text).toBe('Roll for initiative! Hero 20, Goblin 4');
  });

  it('only lets the GM start or end a fight', () => {
    const ana = join_('ana');
    ana.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    expect(ana.take('error')[0]!.message).toMatch(/GM/);
    expect(store.combat).toBeUndefined();
  });

  it('ends the fight and deletes combat.json', async () => {
    const { ana, gm } = fight();
    gm.receive({ t: 'combatEnd' });
    expect(ana.take('combat')).toEqual([{ t: 'combat', combat: null }]);
    await store.flush();
    await expect(access(join(dir, 'combat.json'))).rejects.toThrow();
  });
});

describe('turns', () => {
  it('refuses to move a creature out of turn', () => {
    const { gm } = fight();
    gm.receive({ t: 'move', token: 'goblin', to: [250, 250] });
    expect(gm.take('error')[0]!.message).toMatch(/not Goblin's turn/);
  });

  it('spends movement and refuses to walk further than is left', () => {
    const { ana } = fight();
    ana.receive({ t: 'move', token: 'hero', to: [150, 250] });
    expect(store.combat!.left.move).toBe(25);
    ana.receive({ t: 'move', token: 'hero', to: [50, 50] });
    expect(store.combat!.left.move).toBe(15);
    store.combat = { ...store.combat!, left: { ...store.combat!.left, move: 0 } };
    ana.receive({ t: 'move', token: 'hero', to: [150, 150] });
    expect(ana.take('error')[0]!.message).toMatch(/0 ft of movement left/);
  });

  it('passes the turn when its creature ends it', () => {
    const { ana } = fight();
    const bo = join_('bo');
    bo.receive({ t: 'endTurn' });
    expect(bo.take('error')[0]!.message).toMatch(/not your turn/);
    ana.receive({ t: 'endTurn' });
    expect(ana.take('combat')[0]!.combat).toMatchObject({ turn: 1, left: { move: 30 } });
  });
});

describe('attacking', () => {
  it('rolls to hit, deals damage, logs it in chat and spends the action', () => {
    const { ana } = fight();
    // d20 of 11 + 5 hits AC 15; 1d8 rolls 1, +3.
    dice = [d20(11), 0];
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' });
    expect(store.tokens.get('goblin')!.hp).toBe(3);
    const [log] = ana.take('chat');
    expect(log!.message.attack).toMatchObject({ attacker: 'Hero', target: 'Goblin', hit: true, damage: 4 });
    // Ids and the kind of attack let the map play the swing on the right tokens.
    expect(log!.message.attack).toMatchObject({ attackerId: 'hero', targetId: 'goblin', kind: 'melee' });
    expect(store.combat!.left.action).toBe(false);
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' });
    expect(ana.take('error')[0]!.message).toMatch(/already used/);
  });

  it('pushes the target with a push mastery weapon (2024)', () => {
    store.setToken({
      ...store.tokens.get('hero')!,
      x: 50,
      y: 150,
      stats: { class: 'fighter', level: 1, rules: '2024', maxHp: 12, abilities: { str: 16 } },
      inventory: [{ item: 'warhammer', equipped: true, qty: 1 }],
    });
    store.setToken({ ...store.tokens.get('goblin')!, x: 150, y: 150 });
    const { ana } = fight();
    dice = [d20(15), 0];
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Warhammer' });
    // One square east, then the closed door stops it.
    expect([store.tokens.get('goblin')!.x, store.tokens.get('goblin')!.y]).toEqual([250, 150]);
    expect(ana.take('chat')[0]!.message.attack!.notes).toContain('Goblin is pushed 5 ft');
  });

  it('tells players only how hurt an enemy looks', () => {
    const { ana } = fight();
    dice = [d20(11), 0];
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' });
    const goblin = ana.sent.find((m) => m.t === 'token' && m.token.id === 'goblin');
    expect(goblin).toMatchObject({ token: { health: 'bloodied' } });
    expect(goblin).not.toHaveProperty('token.hp');
  });

  it('refuses targets out of reach and attacks the creature does not have', () => {
    const { ana } = fight();
    store.setToken({ ...store.tokens.get('goblin')!, x: 250, y: 50 + 200 });
    ana.receive({ t: 'move', token: 'hero', to: [50, 50] });
    ana.sent = [];
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' });
    expect(ana.take('error')[0]!.message).toMatch(/out of range/);
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Fireball' });
    expect(ana.take('error')[0]!.message).toMatch(/no attack called Fireball/);
  });

  it('skips creatures at 0 hp when the turn passes', () => {
    const { ana } = fight();
    store.setToken({ ...store.tokens.get('goblin')!, hp: 0 });
    ana.receive({ t: 'endTurn' });
    expect(store.combat).toMatchObject({ round: 2, turn: 0 });
  });
});

describe('equipment', () => {
  it('equips items from the inventory and updates the sheet', () => {
    const ana = join_('ana');
    ana.receive({ t: 'equip', token: 'hero', item: 1, equipped: true });
    const [msg] = ana.take('token');
    expect(msg!.token.sheet!.attacks.map((a) => a.name)).toEqual(['Longsword', 'Dagger']);
  });
});
