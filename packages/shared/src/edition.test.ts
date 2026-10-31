import { describe, expect, it } from 'vitest';
import { editionOf, resolveCreature, srdFor, TokenSchema, WorldSchema } from './index.ts';

const world = (rules?: string) =>
  WorldSchema.parse({ name: 'w', players: [{ id: 'gm', name: 'GM', role: 'gm' }], ...(rules ? { rules } : {}) });
const token = (data: object) => TokenSchema.parse({ id: 't', name: 'T', x: 0, y: 0, ...data });

describe('rules editions', () => {
  it('plays 2014 rules unless the world says otherwise', () => {
    expect(world().rules).toBe('2014');
    expect(world('2024').rules).toBe('2024');
  });

  it('lets a character follow the other edition', () => {
    expect(editionOf(token({}), world())).toBe('2014');
    expect(editionOf(token({ stats: { rules: '2024' } }), world())).toBe('2024');
  });

  it('has SRD 5.1 monsters for 2014 and SRD 5.2 monsters for 2024', () => {
    expect(resolveCreature(token({ monster: 'goblin' }), srdFor('2014'))).toMatchObject({ ac: 15, maxHp: 7 });
    expect(resolveCreature(token({ monster: 'goblin-warrior' }), srdFor('2024'))).toMatchObject({ maxHp: 10 });
    expect(resolveCreature(token({ monster: 'goblin-warrior' }), srdFor('2014'))).toBeUndefined();
  });

  it('shares the weapon and armor list between editions', () => {
    expect(srdFor('2014').items.get('longsword')).toBe(srdFor('2024').items.get('longsword'));
  });
});
