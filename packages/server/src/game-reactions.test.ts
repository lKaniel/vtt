// Reactions to being hit: the shield spell and uncanny dodge pause the attack until answered.
import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];
const face = (n: number, sides = 20) => (n - 1) / sides + 0.001;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  // Ana's wizard knows shield (AC 12); a goblin stands next to her.
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 50,
      y: 50,
      darkvision: 60,
      stats: { class: 'wizard', level: 5, maxHp: 30, abilities: { int: 16, dex: 14 }, spells: ['shield'] },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 150, y: 50, monster: 'goblin' }));
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

const tok = (id: string): Token => store.tokens.get(id)!;

/** The goblin's turn; it swings at the wizard and rolls 10 (14 to hit), then 3 on its d6. */
function goblinSwings(): { ana: FakeSocket; gm: FakeSocket } {
  const ana = join_('ana');
  const gm = join_('gm');
  dice = [face(20), face(1)];
  gm.receive({ t: 'combatStart', tokens: ['goblin', 'hero'] });
  dice = [face(10), face(3, 6)];
  gm.receive({ t: 'attack', attacker: 'goblin', target: 'hero', attack: 'Scimitar' });
  return { ana, gm };
}

describe('reactions to being hit', () => {
  it('waits for the wizard to cast shield, which turns the hit into a miss', () => {
    const { ana } = goblinSwings();
    const [offer] = ana.take('reactionOffer');
    expect(offer!.offer).toMatchObject({ reactor: 'hero', target: 'goblin', kind: 'hit', choices: ['shield'] });
    expect(tok('hero').hp).toBeUndefined();
    ana.receive({ t: 'react', offer: offer!.offer.id, choice: 'shield' });
    expect(tok('hero').hp).toBeUndefined();
    expect(tok('hero').spent?.slots).toEqual([1]);
    expect(tok('hero').effects).toMatchObject([{ name: 'Shield', ac: 5 }]);
    expect(store.combat!.reacted).toEqual(['hero']);
  });

  it('takes the hit when the wizard lets it through', () => {
    const { ana } = goblinSwings();
    const [offer] = ana.take('reactionOffer');
    ana.receive({ t: 'react', offer: offer!.offer.id });
    expect(tok('hero').hp).toBe(30 - 5);
  });

  it('lands the hit unanswered when the turn passes', () => {
    const { gm } = goblinSwings();
    gm.receive({ t: 'endTurn' });
    expect(tok('hero').hp).toBe(30 - 5);
  });
});

describe('reaction spells', () => {
  it('casting hellish rebuke out of turn uses the reaction, once a round', () => {
    store.setToken({ ...tok('hero'), stats: { ...tok('hero').stats, spells: ['hellish-rebuke'] } });
    const ana = join_('ana');
    const gm = join_('gm');
    dice = [face(20), face(1)];
    gm.receive({ t: 'combatStart', tokens: ['goblin', 'hero'] });
    ana.take('error');
    const rebuke = { t: 'cast', caster: 'hero', spell: 'hellish-rebuke', slot: 1, targets: ['goblin'] } as const;
    ana.receive(rebuke);
    expect(ana.take('error')).toEqual([]);
    expect(store.combat!.reacted).toEqual(['hero']);
    ana.receive(rebuke);
    expect(ana.take('error').map((m) => m.message)).toEqual(['Hero has already used their reaction']);
  });
});

describe('per-player automation settings', () => {
  it('a player who never wants hit reactions offered just takes the hit', () => {
    const ana = join_('ana');
    ana.receive({ t: 'seatSettings', settings: { hitReactions: 'never' } });
    expect(game.findPlayer('ana')!.settings).toEqual({ hitReactions: 'never' });
    expect(ana.take('you').at(-1)).toMatchObject({ you: { id: 'ana', settings: { hitReactions: 'never' } } });
    expect(ana.take('welcome')).toEqual([]);
    const { ana: again } = goblinSwings();
    expect(again.take('reactionOffer')).toEqual([]);
    expect(tok('hero').hp).toBe(30 - 5);
  });

  it('refuses settings the game does not know', () => {
    const ana = join_('ana');
    ana.receive({ t: 'seatSettings', settings: { hitReactions: 'sometimes' } });
    expect(ana.take('error')).toHaveLength(1);
    expect(game.findPlayer('ana')!.settings).toBeUndefined();
  });
});
