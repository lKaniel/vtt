import type { Chunk, Point, Wall } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { type DoorCue, DoorSounds } from './door-sounds.ts';

// A door swinging plays its sound for whoever is close enough to hear it.

const door = (state: Wall['door'], extra: Partial<Wall> = {}): Wall => ({
  id: 'd',
  a: [0, 0],
  b: [100, 0],
  door: state,
  ...extra,
});
const chunk = (...walls: Wall[]): Chunk => ({ tiles: [], walls, lights: [] });

function hear(listener: Point | undefined) {
  const cues: DoorCue[] = [];
  const sounds = new DoorSounds({ listener: () => listener, gridSize: () => 100, walls: () => [] }, (c) =>
    cues.push(c),
  );
  return { sounds, cues };
}

describe('door sounds', () => {
  it('plays when a door you can hear swings, not when the map first loads', () => {
    const { sounds, cues } = hear([50, 200]);
    sounds.chunk('0_0', chunk(door('closed')));
    expect(cues).toEqual([]);
    sounds.chunk('0_0', chunk(door('open')));
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ sound: 'wood', swing: 'open' });
    expect(cues[0]!.volume).toBeGreaterThan(0.5);
  });

  it('is quieter far away, silent out of earshot and for quiet doors', () => {
    const near = hear([50, 100]);
    const far = hear([50, 1500]);
    const deaf = hear([50, 9000]);
    for (const { sounds } of [near, far, deaf]) {
      sounds.chunk('0_0', chunk(door('closed')));
      sounds.chunk('0_0', chunk(door('open')));
    }
    expect(far.cues[0]!.volume).toBeLessThan(near.cues[0]!.volume);
    expect(deaf.cues).toEqual([]);
    const quiet = hear([50, 100]);
    quiet.sounds.chunk('0_0', chunk(door('closed', { doorSound: 'none' })));
    quiet.sounds.chunk('0_0', chunk(door('open', { doorSound: 'none' })));
    expect(quiet.cues).toEqual([]);
  });

  it('forgets a chunk you left, so coming back is not a swing', () => {
    const { sounds, cues } = hear([50, 100]);
    sounds.chunk('0_0', chunk(door('closed')));
    sounds.forget(['1_1']);
    sounds.chunk('0_0', chunk(door('open')));
    expect(cues).toEqual([]);
  });
});
