// Where summoned creatures appear: without a grid right where aimed and
// side by side, on a grid on free squares.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
});

afterEach(async () => {
  await store.flush();
});

/** Ana's 5th-level wizard out in the open, south-west of the aimed point, casting Conjure Animals there. */
function conjureWolves(): Token[] {
  const stats = { class: 'wizard', level: 5, maxHp: 30, abilities: { int: 18 }, spells: ['conjure-animals'] };
  store.setToken(TokenSchema.parse({ ...store.tokens.get('hero'), x: 500, y: 600, darkvision: 60, stats }));
  const ana = new FakeSocket();
  game.connect(ana.asWebSocket, game.findPlayer('ana')!);
  ana.take('welcome');
  ana.receive({
    t: 'cast',
    caster: 'hero',
    spell: 'conjure-animals',
    slot: 3,
    targets: [],
    point: [737, 512],
    summon: 'dire-wolf',
  });
  expect(ana.take('error')).toEqual([]);
  return [...store.tokens.values()].filter((t) => t.monster === 'dire-wolf');
}

const apart = (p: Token, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);

describe('where summons appear', () => {
  it('without a grid: where aimed and side by side, not on squares or in anyone', () => {
    const [a, b] = conjureWolves();
    expect([a!.x, a!.y]).toEqual([737, 512]);
    // Large: two squares across, touching but not overlapping each other or the caster.
    expect(apart(a!, b!)).toBeGreaterThanOrEqual(199);
    expect(apart(a!, b!)).toBeLessThan(240);
    const hero = store.tokens.get('hero')!;
    for (const w of [a!, b!]) expect(apart(w, hero)).toBeGreaterThanOrEqual(149);
  });

  it('on a square grid: on free squares round the aimed one', async () => {
    await store.flush();
    await writeFile(join(store.dir, 'scenes/main/scene.json'), JSON.stringify({ darkness: 1, grid: 'square' }));
    store = new GameStore(store.dir);
    await store.load();
    game = new Game(store, { rng: () => 0.5 });
    expect(conjureWolves().map((t) => [t.x, t.y])).toEqual([
      [700, 500],
      [500, 300],
    ]);
  });
});
