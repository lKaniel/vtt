import { describe, expect, it } from 'vitest';
import { inTheWay } from './in-the-way.ts';
import { TokenSchema } from './token-schema.ts';

const token = (data: object) => TokenSchema.parse({ id: 't', name: 'T', x: 150, y: 150, ...data });

describe('creatures in the way of a walk', () => {
  it('are the others on the same level that are still standing, not piles of loot', () => {
    const hero = token({ id: 'hero' });
    const others = [
      hero,
      token({ id: 'ogre', size: 2 }),
      token({ id: 'bat', elevation: 10 }),
      token({ id: 'corpse', hp: 0 }),
      { ...token({ id: 'fallen' }), health: 'down' as const },
      token({ id: 'loot', pile: {} }),
    ];
    expect(inTheWay(hero, others).map((t) => t.id)).toEqual(['ogre']);
  });
});
