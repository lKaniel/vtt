import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';

describe('SRD content', () => {
  it('has every SRD spell for both editions', () => {
    expect(srdFor('2014').spells.size).toBeGreaterThan(300);
    expect(srdFor('2024').spells.size).toBeGreaterThan(300);
  });

  it('reads spell mechanics from the data', () => {
    expect(srdFor('2014').spells.get('fireball')).toMatchObject({
      level: 3,
      range: 150,
      area: { shape: 'sphere', size: 20 },
      save: { ability: 'dex', onSave: 'half' },
      damage: [{ dice: '8d6', type: 'fire' }],
      upcast: { damage: '1d6' },
    });
  });

  it('keeps the editions apart where the rules changed', () => {
    expect(srdFor('2014').spells.get('cure-wounds')?.heal).toBe('1d8');
    expect(srdFor('2024').spells.get('cure-wounds')?.heal).toBe('2d8');
    expect(srdFor('2014').spells.get('inflict-wounds')?.attack).toBe('melee');
    expect(srdFor('2024').spells.get('inflict-wounds')?.save?.ability).toBe('con');
  });

  it('merges the hand-written automation over the imported spells', () => {
    const missile = srdFor('2014').spells.get('magic-missile');
    expect(missile).toMatchObject({ beams: 3, autoHit: true, automated: true, upcast: { beams: 1 } });
    expect(srdFor('2024').spells.get('hold-person')?.effect).toMatchObject({ repeatSave: true });
    expect(srdFor('2014').spells.get('conjure-animals')?.summon).toBeDefined();
    expect(srdFor('2024').spells.get('conjure-animals')?.summon).toBeUndefined();
  });

  it('has the classes with their own rules per edition', () => {
    const fighter14 = srdFor('2014').classes.get('fighter')!;
    const fighter24 = srdFor('2024').classes.get('fighter')!;
    expect(fighter14).toMatchObject({ hitDie: 10, saves: ['str', 'con'] });
    expect(fighter14.features.find((f) => f.id === 'second-wind')?.uses).toEqual([[1, 1]]);
    expect(fighter24.features.find((f) => f.id === 'second-wind')?.uses).toEqual([
      [1, 2],
      [4, 3],
      [10, 4],
    ]);
    expect(fighter24.weaponMastery).toBe(true);
    expect(fighter14.weaponMastery).toBeUndefined();
    expect(srdFor('2024').classes.get('wizard')?.spellcasting).toEqual({
      ability: 'int',
      progression: 'full',
      from: 1,
    });
  });

  it('has the whole SRD bestiary', () => {
    expect(srdFor('2014').monsters.size).toBeGreaterThan(300);
    expect(srdFor('2024').monsters.get('owl')).toMatchObject({ type: 'beast', hp: 1 });
  });
});
