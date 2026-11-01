import { TokenSchema, type TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { dropMessage, tokenAt, type DropContext } from './drops.ts';

const token = (data: object): TokenView => TokenSchema.parse({ id: 't', name: 'T', x: 150, y: 150, ...data });
const hero = token({
  id: 'hero',
  name: 'Hero',
  stats: { spells: ['fire-bolt'] },
  inventory: [{ item: 'dagger', qty: 1 }],
});
const ogre = token({ id: 'ogre', name: 'Ogre', x: 500, y: 500, size: 2 });
const ctx: DropContext = { tokens: [hero, ogre], gridSize: 100, rules: '2014', hidden: false };

describe('finding the creature under the pointer', () => {
  it('uses each token’s size', () => {
    expect(tokenAt(ctx.tokens, [190, 120], 100)?.id).toBe('hero');
    expect(tokenAt(ctx.tokens, [590, 590], 100)?.id).toBe('ogre');
    expect(tokenAt(ctx.tokens, [300, 300], 100)).toBeUndefined();
  });
});

describe('dropping from the Actors list and the Compendium', () => {
  it('spawns monsters and actors where they land', () => {
    expect(dropMessage({ kind: 'monster', id: 'goblin', rules: '2014' }, [320, 320], { ...ctx, hidden: true })).toEqual(
      {
        t: 'spawn',
        from: { kind: 'monster', id: 'goblin', rules: '2014' },
        at: [320, 320],
        hidden: true,
      },
    );
    expect(dropMessage({ kind: 'actor', id: 'bandit' }, [0, 0], ctx)).toMatchObject({ from: { kind: 'actor' } });
  });

  it('gives an item to the creature it lands on, stacking copies', () => {
    expect(dropMessage({ kind: 'item', id: 'dagger' }, [150, 150], ctx)).toEqual({
      t: 'editToken',
      token: 'hero',
      patch: { inventory: [{ item: 'dagger', qty: 2, equipped: false }] },
    });
    expect(dropMessage({ kind: 'item', id: 'longsword' }, [500, 500], ctx)).toEqual({
      t: 'editToken',
      token: 'ogre',
      patch: { inventory: [{ item: 'longsword', qty: 1, equipped: false }] },
    });
    expect(dropMessage({ kind: 'item', id: 'dagger' }, [900, 900], ctx)).toEqual({ error: 'Drop items on a creature' });
  });

  it('teaches a spell from the creature’s own rules', () => {
    expect(dropMessage({ kind: 'spell', id: 'shield', rules: '2014' }, [150, 150], ctx)).toEqual({
      t: 'editToken',
      token: 'hero',
      patch: { stats: { spells: ['fire-bolt', 'shield'] } },
    });
    expect(dropMessage({ kind: 'spell', id: 'fire-bolt', rules: '2014' }, [150, 150], ctx)).toEqual({
      error: 'Hero already knows that spell',
    });
    const caster2024 = token({ id: 'c', name: 'Cleric', stats: { rules: '2024' } });
    expect(
      dropMessage({ kind: 'spell', id: 'branding-smite', rules: '2014' }, [150, 150], { ...ctx, tokens: [caster2024] }),
    ).toEqual({ error: 'Cleric plays by the 2024 rules, which have no such spell' });
    expect(
      dropMessage({ kind: 'spell', id: 'shield', rules: '2014' }, [150, 150], { ...ctx, tokens: [caster2024] }),
    ).toMatchObject({ patch: { stats: { rules: '2024', spells: ['shield'] } } });
  });
});
