import { TokenSchema, type TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { dropMessage, sheetDropMessage, tokenAt, type DropContext } from './drops.ts';

const token = (data: object): TokenView => TokenSchema.parse({ id: 't', name: 'T', x: 150, y: 150, ...data });
const hero = token({ id: 'hero', name: 'Hero', inventory: [{ item: 'dagger', qty: 1 }] });
const ogre = token({ id: 'ogre', name: 'Ogre', x: 500, y: 500, size: 2 });
const chest = token({ id: 'chest', name: 'Chest', x: 900, y: 150, pile: {} });
const ctx: DropContext = { tokens: [hero, ogre, chest], gridSize: 100, hidden: false };

describe('finding the creature under the pointer', () => {
  it('uses each token’s size', () => {
    expect(tokenAt(ctx.tokens, [190, 120], 100)?.id).toBe('hero');
    expect(tokenAt(ctx.tokens, [590, 590], 100)?.id).toBe('ogre');
    expect(tokenAt(ctx.tokens, [300, 300], 100)).toBeUndefined();
  });
});

describe('dropping on the map', () => {
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

  it('puts items, spells and features on the sheet of the creature they land on', () => {
    expect(dropMessage({ kind: 'item', id: 'dagger' }, [150, 150], ctx)).toEqual({
      t: 'drop',
      what: { kind: 'item', id: 'dagger' },
      onto: { kind: 'token', id: 'hero' },
    });
    expect(dropMessage({ kind: 'spell', id: 'shield', rules: '2014' }, [500, 500], ctx)).toMatchObject({
      what: { kind: 'spell', id: 'shield' },
      onto: { id: 'ogre' },
    });
    const rage = { kind: 'feature', id: 'rage', class: 'barbarian', rules: '2014' } as const;
    expect(dropMessage(rage, [150, 150], ctx)).toMatchObject({ what: rage });
    expect(dropMessage({ kind: 'item', id: 'dagger' }, [900, 900], ctx)).toEqual({ error: 'Drop items on a creature' });
  });

  it('hands a carried item to the creature it lands on', () => {
    const carried = { kind: 'carried', from: 'hero', item: 'spell-scroll', spell: 'shield' } as const;
    expect(dropMessage(carried, [500, 500], ctx)).toEqual({
      t: 'give',
      from: 'hero',
      to: 'ogre',
      item: 'spell-scroll',
      spell: 'shield',
    });
    expect(dropMessage(carried, [150, 150], ctx)).toBeUndefined();
  });

  it('drops a carried item on the ground, or puts it in the pile it lands on', () => {
    const dagger = { kind: 'carried', from: 'hero', item: 'dagger' } as const;
    expect(dropMessage(dagger, [900, 900], ctx)).toEqual({ t: 'trade', from: 'hero', item: 0 });
    expect(dropMessage(dagger, [900, 150], ctx)).toEqual({ t: 'trade', from: 'hero', to: 'chest', item: 0 });
    const scroll = { kind: 'carried', from: 'hero', item: 'spell-scroll', spell: 'shield' } as const;
    expect(dropMessage(scroll, [900, 900], ctx)).toEqual({ error: 'Hero doesn’t carry that' });
  });
});

describe('dropping on a character sheet', () => {
  const onto = { kind: 'token', id: 'hero' } as const;

  it('sends compendium entries with the part of the sheet they landed on', () => {
    expect(sheetDropMessage({ kind: 'spell', id: 'fireball', rules: '2014' }, onto, 'inventory')).toEqual({
      t: 'drop',
      what: { kind: 'spell', id: 'fireball', rules: '2014' },
      onto,
      area: 'inventory',
    });
    expect(sheetDropMessage({ kind: 'item', id: 'rope' }, { kind: 'actor', id: 'bandit' })).toEqual({
      t: 'drop',
      what: { kind: 'item', id: 'rope' },
      onto: { kind: 'actor', id: 'bandit' },
    });
  });

  it('hands over items from another creature, and does nothing when one lands back on its own sheet', () => {
    const carried = { kind: 'carried', from: 'ogre', item: 'club' } as const;
    expect(sheetDropMessage(carried, onto)).toEqual({ t: 'give', from: 'ogre', to: 'hero', item: 'club' });
    expect(sheetDropMessage(carried, { kind: 'token', id: 'ogre' })).toBeUndefined();
    expect(sheetDropMessage(carried, { kind: 'actor', id: 'bandit' })).toEqual({
      error: 'Hand it to a creature on the map',
    });
  });

  it('makes a picture the portrait, and leaves creatures and journal entries for the map', () => {
    expect(sheetDropMessage({ kind: 'media', src: 'art/hero.png' }, onto)).toEqual({
      t: 'editToken',
      token: 'hero',
      patch: { img: 'art/hero.png' },
    });
    expect(sheetDropMessage({ kind: 'monster', id: 'goblin', rules: '2014' }, onto)).toEqual({
      error: 'Drop creatures on the map',
    });
    expect(sheetDropMessage({ kind: 'journal', id: 'lore', name: 'Lore' }, onto)).toEqual({
      error: 'Drop journal entries on the map',
    });
  });
});
