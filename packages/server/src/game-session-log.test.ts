import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeTwoScenes } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

// The session log: the server writes what happens at the table (fights,
// kills, loot, level-ups, quests, places, big rolls) into a dated page of
// the adventure book's log, one page per evening of play, for the GM to
// edit and share.

let store: GameStore;
let game: Game;
let dice: number[];
let clock: number;

const HOUR = 3_600_000;

beforeEach(async () => {
  store = new GameStore(await makeTwoScenes());
  await store.load();
  dice = [];
  clock = new Date(2026, 10, 28, 19, 30).getTime();
  game = new Game(store, { rng: () => dice.shift() ?? 0.5, now: () => clock });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      darkvision: 60,
      stats: { level: 1, maxHp: 12, abilities: { str: 16, dex: 10 } },
      inventory: [{ item: 'longsword', equipped: true }],
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 250, y: 150, monster: 'goblin' }));
});

afterEach(async () => {
  game.close();
  await store.flush();
});

const d20 = (face: number) => (face - 1) / 20 + 0.001;

function join_(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.take('welcome');
  return ws;
}

interface Page {
  id: string;
  name: string;
  book?: string;
  ownership?: unknown;
  session?: { start: number; end: number };
  pages: { id: string; text?: string }[];
}

const sessions = () =>
  store.docs
    .all('journals')
    .map((d) => d as unknown as Page)
    .filter((d) => d.session);
const lines = (page = sessions().at(-1)) => (page?.pages.find((p) => p.id === 'events')?.text ?? '').split('\n');

function killTheGoblin(): { ana: FakeSocket; gm: FakeSocket } {
  const ana = join_('ana');
  const gm = join_('gm');
  dice = [d20(20), d20(2)];
  gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
  store.setToken({ ...store.tokens.get('goblin')!, hp: 1 });
  dice = [d20(15), 0];
  ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' });
  return { ana, gm };
}

describe('the session log', () => {
  it('writes a fight and a kill into a dated log page only the GM sees', () => {
    const { gm } = killTheGoblin();
    gm.receive({ t: 'combatEnd' });
    const [page] = sessions();
    expect(page).toMatchObject({ id: 'session-2026-11-28', name: 'Session of 28 November 2026', book: 'log' });
    expect(page!.ownership).toBeUndefined();
    expect(lines()).toEqual([
      '- **Fight:** Hero against Goblin',
      '- Hero killed Goblin',
      '- The fight ended after 1 round',
    ]);
  });

  it('notes critical hits and natural 1s', () => {
    const ana = join_('ana');
    dice = [d20(20), d20(2)];
    join_('gm').receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    dice = [d20(20), 0, 0];
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' });
    expect(lines()).toContain('- Hero landed a critical hit on Goblin with Longsword (5 damage)');
  });

  it('notes a natural 1', () => {
    const ana = join_('ana');
    dice = [d20(20), d20(2)];
    join_('gm').receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    dice = [d20(1)];
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' });
    expect(lines()).toContain('- Hero rolled a natural 1 attacking Goblin');
  });

  it('notes a hero going down', () => {
    join_('ana');
    const gm = join_('gm');
    gm.receive({ t: 'editToken', token: 'hero', patch: { hp: 0 } });
    expect(lines()).toContain('- Hero went down');
  });

  it('notes coins, items and levels the party gains', () => {
    const ana = join_('ana');
    ana.receive({ t: 'carry', token: 'hero', change: { kind: 'gain', coins: { gp: 12, sp: 5 } } });
    const gm = join_('gm');
    gm.receive({
      t: 'editToken',
      token: 'hero',
      patch: {
        inventory: [
          { item: 'longsword', equipped: true },
          { item: 'potion-of-healing', qty: 2 },
        ],
      },
    });
    gm.receive({ t: 'editToken', token: 'hero', patch: { stats: { ...store.tokens.get('hero')!.stats, level: 2 } } });
    expect(lines()).toEqual(['- Hero got 12 gp 5 sp', '- Hero got Potion of Healing ×2', '- Hero reached level 2']);
  });

  it('notes where the party goes and how its quests go', () => {
    join_('ana');
    const gm = join_('gm');
    const shared = { ownership: { default: 'observer' } };
    const quest = { id: 'well', type: 'journal', rev: 0, name: 'Find the well', pages: [], ...shared };
    const objectives = [{ text: 'Ask the innkeeper' }];
    gm.receive({
      t: 'ops',
      txn: 'a',
      ops: [{ op: 'create', coll: 'journals', doc: { ...quest, quest: { status: 'active', objectives } } }],
    });
    gm.receive({
      t: 'ops',
      txn: 'b',
      ops: [
        {
          op: 'update',
          coll: 'journals',
          id: 'well',
          patch: { quest: { status: 'active', objectives: [{ ...objectives[0], done: true }] } },
        },
      ],
    });
    gm.receive({
      t: 'ops',
      txn: 'c',
      ops: [{ op: 'update', coll: 'journals', id: 'well', patch: { quest: { status: 'done', objectives: [] } } }],
    });
    gm.receive({ t: 'activateScene', scene: 'cellar' });
    expect(lines()).toEqual([
      '- New quest: Find the well',
      '- Find the well: Ask the innkeeper, done',
      '- Quest done: Find the well',
      '- The party went to Cellar',
    ]);
  });

  it('leaves out what the GM does alone, and quests still kept from the players', () => {
    const gm = join_('gm');
    gm.receive({ t: 'editToken', token: 'hero', patch: { hp: 0 } });
    join_('ana');
    const quest = { id: 'well', type: 'journal', rev: 0, name: 'Find the well', pages: [] };
    gm.receive({
      t: 'ops',
      txn: 'a',
      ops: [{ op: 'create', coll: 'journals', doc: { ...quest, quest: { status: 'active', objectives: [] } } }],
    });
    expect(sessions()).toEqual([]);
  });

  it('takes a line back when the GM undoes what it reports', () => {
    const { gm } = killTheGoblin();
    gm.receive({ t: 'undo' });
    expect(lines()).toEqual(['- **Fight:** Hero against Goblin']);
    gm.receive({ t: 'redo' });
    expect(lines()).toEqual(['- **Fight:** Hero against Goblin', '- Hero killed Goblin']);
  });

  it('keeps one page for an evening and starts another after four quiet hours', () => {
    join_('ana');
    const gm = join_('gm');
    gm.receive({ t: 'editToken', token: 'hero', patch: { hp: 0 } });
    clock += 3 * HOUR;
    gm.receive({ t: 'editToken', token: 'hero', patch: { hp: 5 } });
    gm.receive({ t: 'editToken', token: 'hero', patch: { hp: 0 } });
    expect(sessions()).toHaveLength(1);
    clock += 5 * HOUR;
    gm.receive({ t: 'editToken', token: 'hero', patch: { hp: 5 } });
    gm.receive({ t: 'editToken', token: 'hero', patch: { hp: 0 } });
    expect(sessions().map((s) => s.id)).toEqual(['session-2026-11-28', 'session-2026-11-29']);
    expect(lines(sessions()[0])).toEqual(['- Hero went down', '- Hero went down']);
  });

  it('keeps what the GM wrote on the page', () => {
    join_('ana');
    const gm = join_('gm');
    gm.receive({ t: 'editToken', token: 'hero', patch: { hp: 0 } });
    const page = sessions()[0]!;
    const text = `We met at the inn.\n${page.pages[0]!.text ?? ''}`;
    gm.receive({
      t: 'ops',
      txn: 'e',
      ops: [{ op: 'update', coll: 'journals', id: page.id, patch: { pages: [{ ...page.pages[0], text }] } }],
    });
    gm.receive({ t: 'editToken', token: 'hero', patch: { hp: 5 } });
    gm.receive({ t: 'editToken', token: 'hero', patch: { hp: 0 } });
    expect(lines()).toEqual(['We met at the inn.', '- Hero went down', '- Hero went down']);
  });
});
