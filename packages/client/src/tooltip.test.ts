import { type Attack, srdFor } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { attackTip, featureTip, itemTip, plainText, spellTip } from './tooltip.ts';

const spell = (id: string) => srdFor('2014').spells.get(id)!;

describe('tooltips', () => {
  it('shows a spell level, school, cost, range, damage and save', () => {
    const tip = spellTip(spell('burning-hands'));
    expect(tip.title).toBe('Burning Hands');
    expect(tip.subtitle).toBe('1st-level evocation');
    expect(tip.facts).toEqual(['Action', 'Self · 15-ft cone', '3d6 fire', 'DEX save, half on success']);
    expect(tip.body).toMatch(/flames/);
  });

  it('marks cantrips, concentration and spells the GM resolves by hand', () => {
    expect(spellTip(spell('fire-bolt'))).toMatchObject({ subtitle: 'Evocation cantrip' });
    expect(spellTip(spell('hold-person')).facts).toContain('Concentration, up to 1 minute');
    const manual = { ...spell('fire-bolt'), automated: false };
    expect(spellTip(manual).warning).toBe('Not automated: the GM applies it');
  });

  it('shows an attack bonus, reach or range and damage', () => {
    const bow: Attack = {
      name: 'Longbow',
      kind: 'ranged',
      toHit: 5,
      range: [150, 600],
      damage: [{ dice: '1d8+3', type: 'piercing' }],
    };
    expect(attackTip(bow)).toEqual({
      title: 'Longbow',
      subtitle: 'Ranged weapon attack',
      facts: ['Action', '+5 to hit', 'Range 150/600 ft', '1d8+3 piercing'],
      body: '',
    });
  });

  it('shows how many uses a feature has left', () => {
    const tip = featureTip({
      id: 'second-wind',
      name: 'Second Wind',
      level: 1,
      description: 'Heal.',
      recharge: 'short',
      action: 'bonus',
      max: 1,
      left: 0,
    });
    expect(tip).toEqual({
      title: 'Second Wind',
      subtitle: 'Class feature',
      facts: ['Bonus action', '0/1 uses · short rest'],
      body: 'Heal.',
    });
  });
});

describe('plain text', () => {
  it('drops markdown emphasis from SRD descriptions', () => {
    expect(plainText('Burns. ***At Higher Levels.*** More **fire** and _smoke_.')).toBe(
      'Burns. At Higher Levels. More fire and smoke.',
    );
  });
});

describe('item tooltips', () => {
  const item = (id: string) => srdFor('2014').items.get(id);

  it('says whether gear is worn and how to change it', () => {
    expect(itemTip(item('longsword'), 'longsword', true)).toEqual({
      title: 'Longsword',
      subtitle: 'weapon · equipped',
      facts: ['Click to unequip'],
      body: '',
    });
    expect(itemTip(item('shield'), 'shield', false).facts).toEqual(['Click to equip']);
  });

  it('describes gear and unknown items', () => {
    expect(itemTip(item('rope'), 'rope', false)).toMatchObject({ subtitle: 'gear', facts: [] });
    expect(itemTip(undefined, 'mystery-orb', false)).toEqual({
      title: 'mystery-orb',
      subtitle: 'item',
      facts: [],
      body: '',
    });
  });
});
