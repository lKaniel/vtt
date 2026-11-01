import { describe, expect, it } from 'vitest';
import { healthOf, srdFor, TokenSchema, viewToken } from './index.ts';
import type { Player } from '@vtt/shared';

const gm: Player = { id: 'gm', name: 'GM', role: 'gm', color: '#fff' };
const ana: Player = { id: 'ana', name: 'Ana', role: 'player', color: '#fff' };

const goblin = TokenSchema.parse({ id: 'g', name: 'Goblin', x: 0, y: 0, monster: 'goblin-warrior', hp: 4 });
const hero = TokenSchema.parse({
  id: 'h',
  name: 'Hero',
  x: 0,
  y: 0,
  ownership: { default: 'limited', ana: 'owner' },
  stats: { maxHp: 12 },
  inventory: [{ item: 'dagger', equipped: true }],
});

describe('healthOf', () => {
  it('describes hit points the way an onlooker would', () => {
    expect([10, 9, 5, 0].map((hp) => healthOf(hp, 10))).toEqual(['unhurt', 'hurt', 'bloodied', 'down']);
  });
});

describe('viewToken', () => {
  it('gives the GM and controllers the full sheet', () => {
    expect(viewToken(goblin, gm, srdFor('2024')).sheet).toMatchObject({ hp: 4, maxHp: 10 });
    expect(viewToken(hero, ana, srdFor('2024')).sheet?.attacks[0]?.name).toBe('Dagger');
  });

  it('tells controllers what their token perceives, from its monster too', () => {
    expect(viewToken(goblin, gm, srdFor('2024')).senses?.darkvision).toBe(60);
    expect(viewToken(goblin, ana, srdFor('2024')).senses).toBeUndefined();
  });

  it('hides stats from other players and tells them only how hurt it looks', () => {
    const seen = viewToken(goblin, ana, srdFor('2024'));
    expect(seen.sheet).toBeUndefined();
    expect(seen.health).toBe('bloodied');
    expect(seen).not.toHaveProperty('monster');
    expect(seen).not.toHaveProperty('hp');
    expect(seen).not.toHaveProperty('stats');
  });

  it("keeps what was made on someone else's sheet from other players", () => {
    const made = { ...hero, own: { items: [{ type: 'gear' as const, id: 'secret', name: 'Secret', weight: 0 }] } };
    const bob = { ...ana, id: 'bob' };
    expect(viewToken(made, bob, srdFor('2024'))).not.toHaveProperty('own');
    expect(viewToken(made, ana, srdFor('2024')).own?.items?.[0]?.name).toBe('Secret');
  });

  it('adds nothing to tokens without stats', () => {
    const tree = TokenSchema.parse({ id: 'tree', name: 'Tree', x: 0, y: 0 });
    expect(viewToken(tree, ana, srdFor('2024'))).toEqual(tree);
  });

  it("shows everyone the monster's painted token without telling them which monster it is", () => {
    const srd = srdFor('2024');
    const painted = { ...srd.monsters.get('goblin-warrior')!, img: '/art/tokens/goblin.webp' };
    const content = { ...srd, monsters: new Map([['goblin-warrior', painted]]) };
    expect(viewToken(goblin, ana, content)).toMatchObject({ art: '/art/tokens/goblin.webp' });
    expect(viewToken(goblin, gm, content)).toMatchObject({ art: '/art/tokens/goblin.webp' });
    expect(viewToken(goblin, ana, srd)).not.toHaveProperty('art');
  });
});
