import { srdFor, type TokenView } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { describeSpell, featureTitle, lowestSlot, previewLabel, targetText } from './spell-text.ts';

const spell = (id: string) => srdFor('2014').spells.get(id)!;
const caster = (left: number[]) => ({ sheet: { caster: { left } } }) as unknown as TokenView;

describe('spell text', () => {
  it('picks the lowest slot with something left', () => {
    expect(lowestSlot(caster([0, 0, 1]), spell('magic-missile'))).toBe(3);
    expect(lowestSlot(caster([0, 0, 0]), spell('magic-missile'))).toBeUndefined();
    expect(lowestSlot(caster([]), spell('fire-bolt'))).toBe(0);
  });

  it('describes a spell for its tooltip', () => {
    expect(describeSpell(spell('fireball'))).toMatch(
      /^Fireball: 3rd-level evocation, action, 150 ft, Instantaneous\n\n/,
    );
    expect(describeSpell(spell('fire-bolt'))).toMatch(/^Fire Bolt: evocation cantrip, action, 120 ft/);
    expect(describeSpell(spell('shield'))).toMatch(/reaction, self/);
    expect(describeSpell(spell('wish'))).toMatch(/not automated/);
  });

  it('sums up what a spell did to one target', () => {
    expect(targetText({ target: 'Goblin', hit: true, damage: 7, attack: { total: 18 } as never })).toBe(
      'Goblin: 18 hit · 7 damage',
    );
    expect(targetText({ target: 'Orc', hit: false, crit: false, damage: 0, attack: { total: 3 } as never })).toBe(
      'Orc: 3 miss',
    );
    expect(targetText({ target: 'Orc', damage: 4, save: { ability: 'dex', dc: 15, total: 16, success: true } })).toBe(
      'Orc: DEX save 16 vs DC 15, saved · 4 damage',
    );
    expect(targetText({ target: 'Ana', damage: 0, healed: 6, effect: 'Bless' })).toBe('Ana: heals 6 · Bless');
    expect(targetText({ target: 'Wolf', damage: 0, immune: true })).toBe('Wolf: unaffected');
  });

  it('labels a feature tile with its uses', () => {
    expect(featureTitle({ name: 'Rage', max: 2, left: 1, description: 'Grr.' } as never)).toBe('Rage (1/2): Grr.');
    expect(featureTitle({ name: 'Dash', description: 'Go.' } as never)).toBe('Dash: Go.');
  });

  it('labels the aiming preview', () => {
    expect(previewLabel({ name: 'Bless', count: '1/3', feet: 25, reach: 30, blocked: false })).toBe(
      'Bless · 1/3 · 25 ft',
    );
    expect(previewLabel({ name: 'Fireball', feet: 200, reach: 150, blocked: false })).toBe(
      'Fireball · 200 ft · out of range',
    );
    expect(previewLabel({ name: 'Burning Hands', feet: 10, reach: 0, blocked: true })).toBe(
      'Burning Hands · no clear path',
    );
  });
});
