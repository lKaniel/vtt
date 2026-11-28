import { describe, expect, it } from 'vitest';
import { characterToken, newCharacter } from './character.ts';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { featureCasts } from './free-casts.ts';
import { resolveCast } from './spells.ts';
import type { Edition } from './stats-schema.ts';
import { type Token, TokenSchema } from './token-schema.ts';

// Spells a species or lineage gives (species-automation.json): a tiefling's
// infernal legacy, a 2024 elf's or gnome's lineage, cast like any other.

const pc = (rules: Edition, [cls, level]: [string, number], species: string, lineage?: string) =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    stats: { rules, class: cls, level, species, lineage, maxHp: 20, abilities: { cha: 16, int: 12 } },
  });
const sheet = (t: Token) => resolveCreature(t, srdFor(t.stats?.rules ?? '2014'))!;
const spell = (t: Token, id: string) => srdFor(t.stats?.rules ?? '2014').spells.get(id)!;
const known = (t: Token) => sheet(t).caster?.spells.map((s) => s.id) ?? [];

describe('species spells', () => {
  it('gives a 2014 tiefling fighter thaumaturgy, then hellish rebuke at 3rd level as a 2nd-level spell once a day', () => {
    const young = pc('2014', ['fighter', 1], 'tiefling');
    expect(known(young)).toEqual(['thaumaturgy']);
    expect(featureCasts(sheet(young), spell(young, 'hellish-rebuke'))).toEqual([]);
    const older = pc('2014', ['fighter', 3], 'tiefling');
    expect(featureCasts(sheet(older), spell(older, 'hellish-rebuke'))).toEqual([
      { feature: 'infernal-legacy-3', name: 'Infernal Legacy: Hellish Rebuke', level: 2, self: false, left: 1, max: 1 },
    ]);
    expect(sheet(older).caster?.ability).toBe('cha');
  });

  it('gives a 2024 drow their lineage spells, a wizard keeping them prepared too', () => {
    const drow = pc('2024', ['wizard', 5], 'elf', 'drow');
    expect(known(drow)).toEqual(expect.arrayContaining(['dancing-lights', 'faerie-fire', 'darkness']));
    expect(featureCasts(sheet(drow), spell(drow, 'darkness'))[0]).toMatchObject({ feature: 'drow-lineage-5', left: 1 });
  });

  it('gives a species with no spells none', () => {
    expect(sheet(pc('2024', ['fighter', 5], 'dwarf')).caster).toBeUndefined();
  });

  it('a character made in the creator remembers its species and lineage', () => {
    const c = {
      ...newCharacter({ id: 'c', owner: 'ana', rules: '2024' }),
      species: 'tiefling',
      subspecies: 'infernal',
    };
    expect(characterToken(c).stats).toMatchObject({ species: 'tiefling', lineage: 'infernal' });
  });
});

describe('the ability species spells are cast with', () => {
  const save = (caster: Token, id: string) => {
    const target = TokenSchema.parse({ id: 'g', name: 'Goblin', x: 80, y: 50, monster: 'goblin' });
    const goblin = resolveCreature(target, srdFor(caster.stats?.rules ?? '2014'))!;
    const cast = { spell: spell(caster, id), slot: spell(caster, id).level, gridSize: 50 };
    const targets = [{ token: target, sheet: goblin }];
    return resolveCast({ ...cast, caster: { token: caster, sheet: sheet(caster) }, targets }, () => 0.5).results[0]!
      .save!.dc;
  };

  it("casts a 2014 tiefling wizard's infernal legacy with Charisma, not Intelligence", () => {
    const wizard = pc('2014', ['wizard', 3], 'tiefling');
    expect(sheet(wizard).caster?.spellAbilities).toEqual({
      thaumaturgy: 'cha',
      'hellish-rebuke': 'cha',
    });
    // Charisma 16 (+3), proficiency +2; the wizard's own Intelligence 12 would make it 11.
    expect(save(wizard, 'hellish-rebuke')).toBe(13);
  });

  it("casts a 2024 lineage's spells with the ability picked for them, else the best of Int, Wis and Cha", () => {
    const fighter = pc('2024', ['fighter', 3], 'tiefling', 'abyssal');
    expect(sheet(fighter).caster?.ability).toBe('cha');
    const picked = { ...fighter, stats: { ...fighter.stats, speciesAbility: 'int' as const } };
    expect(sheet(picked).caster?.spellAbilities?.['ray-of-sickness']).toBe('int');
  });

  it('lets a 2014 high elf pick a wizard cantrip, known and cast with Intelligence', () => {
    const elf = pc('2014', ['cleric', 1], 'elf', 'high-elf');
    expect(sheet(elf).features.find((f) => f.id === 'high-elf-cantrip')?.spellPicks).toBeDefined();
    const picked = { ...elf, stats: { ...elf.stats, spellPicks: { 'high-elf-cantrip': ['fire-bolt'] } } };
    expect(known(picked)).toContain('fire-bolt');
    expect(sheet(picked).caster?.spellAbilities?.['fire-bolt']).toBe('int');
    const wrong = { ...elf, stats: { ...elf.stats, spellPicks: { 'high-elf-cantrip': ['sacred-flame'] } } };
    expect(known(wrong)).not.toContain('sacred-flame');
  });
});
