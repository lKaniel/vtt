import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Wall } from '@vtt/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// The fixture room's walls made 10 ft high: a hero flying above them sees
// the lit goblin outside and can fly out over them.

let store: GameStore;

afterEach(async () => {
  await store.flush();
});

async function room(heroElevation: number): Promise<Game> {
  const dir = await makeWorld();
  const walls = join(dir, 'scenes/main/walls.json');
  const list = JSON.parse(await readFile(walls, 'utf8')) as Wall[];
  await writeFile(walls, JSON.stringify(list.map((w) => ({ ...w, height: { top: 10 } }))));
  const tokens = join(dir, 'scenes/main/tokens.json');
  const toks = JSON.parse(await readFile(tokens, 'utf8')) as { id: string }[];
  await writeFile(tokens, JSON.stringify(toks.map((t) => (t.id === 'hero' ? { ...t, elevation: heroElevation } : t))));
  store = new GameStore(dir);
  await store.load();
  return new Game(store);
}

function join_(game: Game): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer('ana')!);
  return ws;
}

describe('wall height', () => {
  it('lets a hero above the walls see over them', async () => {
    const [low] = join_(await room(0)).take('welcome');
    expect(low!.tokens.map((t) => t.id)).toEqual(['hero']);
    const [high] = join_(await room(30)).take('welcome');
    expect(high!.tokens.map((t) => t.id).sort((a, b) => a.localeCompare(b))).toEqual(['goblin', 'hero']);
  });

  it('lets a hero above the walls fly out over them, not one on the ground', async () => {
    const ground = join_(await room(0));
    ground.receive({ t: 'move', token: 'hero', to: [450, 50] });
    const walked = ground.take('moved')[0];
    expect(walked?.path.length ?? 99).toBeGreaterThan(2);
    const flier = join_(await room(30));
    flier.receive({ t: 'move', token: 'hero', to: [450, 50] });
    expect(flier.take('moved')[0]!.path).toEqual([
      [150, 150],
      [450, 50],
    ]);
  });
});
