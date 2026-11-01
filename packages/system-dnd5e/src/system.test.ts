import { defaultEdition, SystemRegistry } from '@vtt/core';
import { dnd5e, toEdition } from './index.ts';
import { describe, expect, it } from 'vitest';

const token = (extra: object = {}) => dnd5e.tokenSchema.parse({ id: 'g', name: 'Goblin', x: 50, y: 50, ...extra });

describe('the D&D 5e system', () => {
  it('plays the 2014 and 2024 rules, 2014 by default', () => {
    expect(dnd5e.id).toBe('dnd5e');
    expect(dnd5e.editions.map((e) => e.id)).toEqual(['2014', '2024']);
    expect(defaultEdition(dnd5e)).toBe('2014');
  });

  it('reads a token with its sheet, filling the defaults', () => {
    const t = token({ monster: 'goblin' });
    expect([t.size, t.speed, t.darkvision, t.monster]).toEqual([1, 30, 0, 'goblin']);
  });

  it('names what a token refers to that the edition lacks', () => {
    expect(dnd5e.tokenIssues(token({ monster: 'goblin' }), '2014')).toEqual([]);
    expect(dnd5e.tokenIssues(token({ monster: 'tarrasque-jr' }), '2014')).toEqual([
      'unknown monster "tarrasque-jr" in the 2014 rules',
    ]);
  });

  it('knows the items and spells made on a sheet', () => {
    const made = token({
      stats: { spells: ['glare'] },
      own: {
        items: [{ type: 'gear', id: 'lucky-coin', name: 'Lucky coin' }],
        spells: [{ id: 'glare', name: 'Glare', level: 0, school: 'evocation', castingTime: 'action', range: 30 }],
      },
      inventory: [{ item: 'lucky-coin' }, { item: 'lost-coin' }],
    });
    expect(dnd5e.tokenIssues(made, '2014')).toEqual(['unknown item "lost-coin"']);
  });

  it('works out how a token perceives from its stat block', () => {
    const goblin = token({ monster: 'goblin' });
    expect(dnd5e.perceiver(goblin, '2014').senses.darkvision).toBe(60);
  });

  it('treats a missing or unknown edition as its default', () => {
    expect(toEdition(undefined)).toBe('2014');
    expect(toEdition('2024')).toBe('2024');
    expect(toEdition('1977')).toBe('2014');
  });

  it('goes in a registry like any system', () => {
    expect(new SystemRegistry([dnd5e]).infos()[0]).toMatchObject({ id: 'dnd5e', name: 'Dungeons & Dragons 5e' });
  });
});
