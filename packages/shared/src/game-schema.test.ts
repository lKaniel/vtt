import { describe, expect, it } from 'vitest';
import { GameSchema, SceneSchema, splitWorld, worldOf } from './index.ts';

const game = GameSchema.parse({
  id: 'example',
  name: 'The crossroads',
  scene: 'crossroads',
  players: [{ id: 'gm', name: 'GM', role: 'gm' }],
});

describe('game and scene files', () => {
  it('fill the same defaults the world file had', () => {
    expect(game.rules).toBe('2014');
    expect(SceneSchema.parse({})).toEqual({ gridSize: 100, chunkSize: 2000, start: [0, 0], darkness: 0, vision: true });
  });

  it('combine into the table settings the game and the client use, and split back', () => {
    const scene = SceneSchema.parse({ name: 'Crossroads', darkness: 0.85, start: [1000, 900] });
    const world = worldOf(game, scene);
    expect(world).toMatchObject({ name: 'The crossroads', darkness: 0.85, start: [1000, 900], rules: '2014' });
    expect(world.players).toHaveLength(1);
    const back = splitWorld({ ...world, darkness: 0.2, rules: '2024' }, game, scene);
    expect(back.game).toEqual({ ...game, rules: '2024' });
    expect(back.scene).toEqual({ ...scene, darkness: 0.2 });
  });
});
