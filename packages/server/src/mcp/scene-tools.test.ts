import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../game.ts';
import { GameStore } from '../store/game-store.ts';
import { makeTwoScenes } from '../test/fixtures.ts';
import { mcpTools } from './mcp-tools.ts';
import type { McpContent } from './mcp-protocol.ts';

// Claude making and changing scenes over the bridge, as the test game's GM.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeTwoScenes());
  await store.load();
  game = new Game(store, { rng: () => 0 });
});

afterEach(async () => {
  await store.flush();
});

type Answer = string | McpContent[];

function toolsFor(player: string): (name: string, args?: Record<string, unknown>) => Promise<Answer> {
  const tools = mcpTools({
    games: () => Promise.resolve([{ id: 'test', name: 'Test', role: 'gm' }]),
    seat: () => Promise.resolve({ game, player: game.findPlayer(player)! }),
    guide: () => Promise.resolve('# Game format'),
  });
  return (name, args = {}) => {
    const tool = tools.find((t) => t.name === name)!;
    return tool.run(tool.input.parse(args) as never);
  };
}

const json = (a: Answer) => JSON.parse(a as string) as Record<string, unknown>;
const walls = (scene: string) => store.docs.all(`${scene}/walls`);

describe('scene tools', () => {
  it('make a new scene with ground to build on', async () => {
    const gm = toolsFor('gm');
    const made = json(await gm('create_scene', { name: 'Old Crypt', width: 20, height: 15, ground: 'stone' }));
    expect(made).toMatchObject({ scene: 'old-crypt' });
    expect(store.docs.get('scenes', 'old-crypt')).toMatchObject({ name: 'Old Crypt', start: [1000, 750] });
    expect(store.docs.all('old-crypt/tiles')).toEqual([
      expect.objectContaining({ kind: 'rect', texture: 'stone', background: true, w: 2000, h: 1500 }),
    ]);
  });

  it('build rooms, lights and creatures in one step that one undo takes back', async () => {
    const gm = toolsFor('gm');
    const said = await gm('build_scene', {
      scene: 'cellar',
      rooms: [{ name: 'Crypt', x: 2, y: 2, w: 4, h: 3, floor: 'stone', light: 'torch', doors: [{ side: 's', at: 1 }] }],
      tokens: [{ monster: 'skeleton', x: 3, y: 3, count: 2 }],
    });
    for (const part of ['walls 6', 'tiles 1', 'lights 1', 'creatures 2']) expect(said).toContain(part);
    expect(walls('cellar').filter((w) => w.door === 'closed')).toHaveLength(1);
    expect(
      store.inScene('cellar', () => [...store.tokens.values()].filter((t) => t.monster === 'skeleton')),
    ).toHaveLength(2);

    await gm('undo');
    expect(walls('cellar').map((w) => w.id)).toEqual(['cw']);
    expect(store.inScene('cellar', () => store.tokens.size)).toBe(2);
  });

  it('describe a scene item by item, and sketch it as a picture', async () => {
    const gm = toolsFor('gm');
    await gm('build_scene', { scene: 'cellar', lights: [{ x: 1, y: 1, preset: 'campfire' }] });
    const seen = json(await gm('describe_scene', { scene: 'cellar' }));
    expect(seen).toMatchObject({ scene: { id: 'cellar', name: 'Cellar' }, counts: { walls: 1, lights: 1, tokens: 2 } });
    expect((seen.items as Record<string, unknown[]>).lights).toEqual([expect.objectContaining({ id: 'campfire' })]);

    const [picture, legend] = (await gm('render_scene', { scene: 'cellar', size: 256 })) as McpContent[];
    expect(picture).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(
      Buffer.from((picture as { data: string }).data, 'base64')
        .subarray(1, 4)
        .toString(),
    ).toBe('PNG');
    expect(legend).toMatchObject({ type: 'text' });
    expect((legend as { text: string }).text).toContain('rat "Rat" at (550, 150)');
  });

  it('clear what lies inside an area', async () => {
    const gm = toolsFor('gm');
    await gm('build_scene', {
      scene: 'cellar',
      walls: [
        {
          points: [
            [3, 3],
            [5, 3],
            [5, 5],
          ],
        },
      ],
    });
    const said = await gm('clear_area', { scene: 'cellar', x: 2, y: 2, w: 4, h: 4 });
    expect(said).toMatch(/walls 2/);
    expect(walls('cellar').map((w) => w.id)).toEqual(['cw']);
  });

  it('take the GM to a scene, or the whole table', async () => {
    const gm = toolsFor('gm');
    await gm('go_to_scene', { scene: 'cellar', everyone: true });
    expect(store.docs.all('game')[0]).toMatchObject({ scene: 'cellar' });
  });

  it('leave scenes to the GM', async () => {
    await expect(toolsFor('ana')('build_scene', { scene: 'cellar', lights: [{ x: 1, y: 1 }] })).rejects.toThrow(/GM/);
  });
});
