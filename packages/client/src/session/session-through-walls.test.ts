import { describe, expect, it, vi } from 'vitest';
import { Requests } from './session-requests.ts';
import { ThroughWalls } from './session-through-walls.ts';

describe('ignoring walls', () => {
  it('is the GM’s alone, and their moves then go through walls', () => {
    const changed = vi.fn();
    const sent: unknown[] = [];
    const host = { send: (m: unknown) => sent.push(m), isGm: () => true, throughWalls: undefined as unknown };
    const walls = new ThroughWalls({ changed }, host);
    host.throughWalls = walls;
    const requests = new Requests(host as never);
    requests.move('hero', [1, 2]);
    walls.toggle();
    expect(walls.on).toBe(true);
    expect(changed).toHaveBeenCalledOnce();
    requests.move('hero', [3, 4]);
    expect(sent).toEqual([
      { t: 'move', token: 'hero', to: [1, 2] },
      { t: 'move', token: 'hero', to: [3, 4], throughWalls: true },
    ]);
  });

  it('stays off for players', () => {
    const changed = vi.fn();
    const walls = new ThroughWalls({ changed }, { isGm: () => false });
    walls.toggle();
    expect(walls.on).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });
});
