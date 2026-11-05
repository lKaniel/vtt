import { describe, expect, it } from 'vitest';
import { Requests } from './session-requests.ts';
import { View3DSwitch } from './session-view3d.ts';

// In 3D a walk says how high it ends: the 3D view climbs the path over the
// surfaces it crosses (a bridge, a tower's stairs) and the server takes it.

describe('walking in 3D', () => {
  const table = (view: '2d' | '3d') => {
    const sent: unknown[] = [];
    const view3d = new View3DSwitch({ changed: () => undefined }, { world: { view }, isGm: () => false });
    view3d.climb = (token, to) => (token === 'hero' && to[0] > 100 ? 15 : undefined);
    return { sent, requests: new Requests({ send: (m) => sent.push(m), view3d }) };
  };

  it('ends the walk at the height of what the creature climbs onto', () => {
    const { sent, requests } = table('3d');
    requests.move('hero', [200, 50]);
    requests.move('hero', [50, 50]);
    expect(sent).toEqual([
      { t: 'move', token: 'hero', to: [200, 50], elevation: 15 },
      { t: 'move', token: 'hero', to: [50, 50] },
    ]);
  });

  it('walks a flat map as it is', () => {
    const { sent, requests } = table('2d');
    requests.move('hero', [200, 50]);
    expect(sent).toEqual([{ t: 'move', token: 'hero', to: [200, 50] }]);
  });
});
