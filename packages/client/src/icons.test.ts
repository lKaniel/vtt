import { type Attack, srdFor } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { attackIcon, effectIcon, featureIcon, itemIcon, spellIcon } from './icons.ts';

const spell = (id: string) => srdFor('2014').spells.get(id)!;

const attack = (a: Partial<Attack>): Attack => ({
  name: 'Longsword',
  kind: 'melee',
  toHit: 5,
  damage: [{ dice: '1d8+3', type: 'slashing' }],
  ...a,
});

describe('spell icons', () => {
  it('draws damaging spells by their damage type', () => {
    expect(spellIcon(spell('fire-bolt'))).toEqual({ glyph: 'flame', tint: 'fire' });
    expect(spellIcon(spell('ray-of-frost'))).toEqual({ glyph: 'snowflake', tint: 'cold' });
    expect(spellIcon(spell('magic-missile'))).toEqual({ glyph: 'bolts', tint: 'force' });
  });

  it('draws healing, summons, teleports and wards by what they do', () => {
    expect(spellIcon(spell('cure-wounds'))).toMatchObject({ glyph: 'heart', tint: 'heal' });
    expect(spellIcon(spell('find-familiar'))).toMatchObject({ glyph: 'paw' });
    expect(spellIcon(spell('misty-step'))).toMatchObject({ glyph: 'mist' });
    expect(spellIcon(spell('shield'))).toMatchObject({ glyph: 'shield' });
  });

  it('falls back to the school', () => {
    expect(spellIcon(spell('hold-person'))).toEqual({ glyph: 'chain', tint: 'enchantment' });
    expect(spellIcon(spell('bless'))).toEqual({ glyph: 'sun', tint: 'radiant' });
  });
});

describe('attack icons', () => {
  it('tells blades, blunt weapons, bows and natural weapons apart', () => {
    expect(attackIcon(attack({}))).toEqual({ glyph: 'sword', tint: 'steel' });
    expect(attackIcon(attack({ damage: [{ dice: '1d6', type: 'bludgeoning' }] }))).toEqual({
      glyph: 'mace',
      tint: 'steel',
    });
    expect(attackIcon(attack({ kind: 'ranged', damage: [{ dice: '1d8', type: 'piercing' }] }))).toEqual({
      glyph: 'bow',
      tint: 'steel',
    });
    expect(attackIcon(attack({ name: 'Bite', damage: [{ dice: '1d8', type: 'piercing' }] }))).toEqual({
      glyph: 'claw',
      tint: 'steel',
    });
  });
});

describe('feature icons', () => {
  it('draws healing and effect features apart from the rest', () => {
    expect(featureIcon({ heal: '1d10+level' })).toEqual({ glyph: 'heart', tint: 'heal' });
    expect(featureIcon({ effect: { name: 'Rage' } })).toEqual({ glyph: 'fist', tint: 'fire' });
    expect(featureIcon({ grantAction: true })).toEqual({ glyph: 'boot', tint: 'steel' });
    expect(featureIcon({})).toEqual({ glyph: 'star', tint: 'arcane' });
  });
});

describe('effect icons', () => {
  it('draws conditions by what they do, other effects by whether they help', () => {
    expect(effectIcon({ conditions: ['paralyzed'] })).toEqual({ glyph: 'chain', tint: 'enchantment' });
    expect(effectIcon({ conditions: ['frightened'] })).toEqual({ glyph: 'skull', tint: 'necromancy' });
    expect(effectIcon({ conditions: ['invisible'] })).toEqual({ glyph: 'mask', tint: 'illusion' });
    expect(effectIcon({ attackBonus: '1d4' })).toEqual({ glyph: 'sun', tint: 'radiant' });
    expect(effectIcon({ ac: 5 })).toEqual({ glyph: 'shield', tint: 'abjuration' });
    expect(effectIcon({ attackBonus: '-1d4' })).toEqual({ glyph: 'swirl', tint: 'necromancy' });
  });
});

describe('item icons', () => {
  const item = (id: string) => srdFor('2014').items.get(id)!;

  it('draws weapons like their attacks, armor as shields and gear by what it is', () => {
    expect(itemIcon(item('longbow'))).toEqual({ glyph: 'bow', tint: 'steel' });
    expect(itemIcon(item('club'))).toEqual({ glyph: 'mace', tint: 'steel' });
    expect(itemIcon(item('chain-mail'))).toEqual({ glyph: 'shield', tint: 'steel' });
    expect(itemIcon(item('potion-of-healing'))).toEqual({ glyph: 'vial', tint: 'heal' });
    expect(itemIcon(item('torch'))).toEqual({ glyph: 'flame', tint: 'fire' });
    expect(itemIcon(item('rope'))).toEqual({ glyph: 'star', tint: 'steel' });
    expect(itemIcon(undefined)).toEqual({ glyph: 'star', tint: 'steel' });
  });
});
