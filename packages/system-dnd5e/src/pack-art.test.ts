import { describe, expect, it } from 'vitest';
import { mediaEntry, type MediaEntry } from '@vtt/core';
import { dnd5ePackArt } from './pack-art.ts';

const entries = (pack: string, paths: string[]): MediaEntry[] =>
  paths.map((p) => mediaEntry(`pack://${pack}/media/${p}`, p, pack)!);

const jb2a = entries('jb2a', [
  'Library/3rd_Level/Fireball/FireballBeam_01_Orange_30ft_1600x400.webm',
  'Library/3rd_Level/Fireball/FireballExplosion_01_Blue_1000x1000.webm',
  'Library/3rd_Level/Fireball/FireballExplosion_01_Orange_1000x1000.webm',
  'Library/3rd_Level/Fireball/FireballLoop_01_Orange_800x800.webm',
  'Library/Cantrip/Fire_Bolt/FireBolt_01_Regular_Blue_30ft_1600x400.webm',
  'Library/Cantrip/Fire_Bolt/FireBolt_01_Regular_Orange_05ft_600x400.webm',
  'Library/Cantrip/Fire_Bolt/FireBolt_01_Regular_Orange_30ft_1600x400.webm',
  'Library/Cantrip/Fire_Bolt/FireBolt_01_Regular_Orange_90ft_4000x400.webm',
  'Library/Cantrip/Fire_Bolt/FireBolt_01_Regular_Orange_Thumb.webp',
  'Library/1st_Level/Cure_Wounds/CureWounds_01_Blue_200x200.webm',
  'Library/1st_Level/Cure_Wounds/CureWounds_01_Green_200x200.webm',
  'Library/1st_Level/Cure_Wounds/CureWounds_01_Green_400x400.webm',
  'Library/Generic/Healing/HealingAbility_01_Green_400x400.webm',
  'Library/Generic/Weapon_Attacks/Melee/Group02/MeleeAttack02_Mace01_01_800x600.webm',
  'Library/Generic/Weapon_Attacks/Melee/Group03/MeleeAttack03_GreatSword01_01_800x600.webm',
  'Library/Generic/Weapon_Attacks/Melee/Legacy/Sword01_01_Regular_White_800x600.webm',
  'Library/Generic/Weapon_Attacks/Ranged/Arrow01_01_Regular_White_15ft_1000x400.webm',
  'Library/Generic/Weapon_Attacks/Ranged/Arrow01_01_Regular_White_60ft_2800x400.webm',
  'Library/Generic/Weapon_Attacks/Ranged/Dagger01_01_Regular_White_30ft_1600x400.webm',
  'Library/Generic/Creature/Claw/CreatureAttackClaw_001_001_Red_800x600.webm',
  'Library/Generic/Unarmed_Attacks/Unarmed_Strike/UnarmedStrike_01_Regular_Blue_Physical01_800x600.webm',
  'Library/Generic/Unarmed_Attacks/Unarmed_Strike/UnarmedStrikeNoHit_01_Regular_Blue_800x600.webm',
  'Library/2nd_Level/Spiritual_Weapon/SpiritualWeapon_Mace01_01_Spectral_Blue_400x400.webm',
]);

describe('pack art matched by name', () => {
  const anim = dnd5ePackArt(jb2a).animation!;

  it('gives a spell the videos in the folder named after it', () => {
    expect(anim['spell:fire-bolt']).toEqual([
      'pack://jb2a/media/Library/Cantrip/Fire_Bolt/FireBolt_01_Regular_Orange_05ft_600x400.webm',
      'pack://jb2a/media/Library/Cantrip/Fire_Bolt/FireBolt_01_Regular_Orange_30ft_1600x400.webm',
      'pack://jb2a/media/Library/Cantrip/Fire_Bolt/FireBolt_01_Regular_Orange_90ft_4000x400.webm',
    ]);
  });

  it('picks an area spell’s explosion in its damage colour, never a loop', () => {
    expect(anim['spell:fireball']).toEqual([
      'pack://jb2a/media/Library/3rd_Level/Fireball/FireballExplosion_01_Orange_1000x1000.webm',
    ]);
  });

  it('dresses a lasting area in the spell’s loop', () => {
    expect(anim['zone:fireball']).toEqual([
      'pack://jb2a/media/Library/3rd_Level/Fireball/FireballLoop_01_Orange_800x800.webm',
    ]);
  });

  it('keeps the largest of the same video, and heals in green', () => {
    expect(anim['spell:cure-wounds']).toEqual([
      'pack://jb2a/media/Library/1st_Level/Cure_Wounds/CureWounds_01_Green_400x400.webm',
    ]);
    expect(anim.heal).toEqual(['pack://jb2a/media/Library/Generic/Healing/HealingAbility_01_Green_400x400.webm']);
  });

  it('matches weapon attacks to weapons, melee and ranged', () => {
    expect(anim['melee:mace']).toHaveLength(1);
    expect(anim['melee:greatsword']![0]).toContain('GreatSword01');
    expect(anim['melee:longsword']![0]).toContain('Sword01_01_Regular_White');
    expect(anim['ranged:longbow']).toHaveLength(2);
    expect(anim['ranged:shortbow']).toEqual(anim['ranged:longbow']);
    expect(anim['ranged:dagger']![0]).toContain('Dagger01');
    expect(anim['melee:claw']![0]).toContain('CreatureAttackClaw');
    expect(anim['melee:unarmed-strike']![0]).toContain('UnarmedStrike_01');
  });

  it('leaves weapons in spell folders alone', () => {
    expect(anim['melee:mace']![0]).not.toContain('Spiritual');
  });
});

describe('pictures matched by name', () => {
  const art = dnd5ePackArt(
    entries('icons', [
      'icons/svg/chest.svg',
      'icons/magic/fire/projectile-fireball.webp',
      'dnd5e/icons/svg/statuses/blinded.svg',
      'dnd5e/tokens/thumbs/Skeleton.webp',
      'dnd5e/tokens/undead/Skeleton.webp',
      'dnd5e/tokens/beast/BrownBear.webp',
      'dnd5e/tokens/beast/CatOrange.webp',
      'dnd5e/tokens/humanoid/Goblin.webp',
      'dnd5e/tokens/beast/SwarmBats.webp',
      'dnd5e/tokens/dragon/RedDragonAdult.webp',
      'items/fire_arrow.webp',
      'spells/Fireball.png',
    ]),
  );

  it('names known ids by file name', () => {
    expect(art.item?.chest).toEqual(['pack://icons/media/icons/svg/chest.svg']);
    expect(art.condition?.blinded).toEqual(['pack://icons/media/dnd5e/icons/svg/statuses/blinded.svg']);
  });

  it('takes token pictures as monsters', () => {
    expect(art.monster?.skeleton).toEqual(['pack://icons/media/dnd5e/tokens/undead/Skeleton.webp']);
    expect(art.monster?.['brown-bear']).toBeDefined();
  });

  it('finds a monster’s token named loosely: words in another order, without “of”, or with more words', () => {
    expect(art.monster?.['adult-red-dragon']).toEqual(['pack://icons/media/dnd5e/tokens/dragon/RedDragonAdult.webp']);
    expect(art.monster?.['swarm-of-bats']).toEqual(['pack://icons/media/dnd5e/tokens/beast/SwarmBats.webp']);
    expect(art.monster?.cat).toEqual(['pack://icons/media/dnd5e/tokens/beast/CatOrange.webp']);
    expect(art.monster?.['goblin-boss']).toEqual(['pack://icons/media/dnd5e/tokens/humanoid/Goblin.webp']);
  });

  it('takes anything in a folder named for a kind, known or not', () => {
    expect(art.item?.['fire-arrow']).toEqual(['pack://icons/media/items/fire_arrow.webp']);
    expect(art.spell?.fireball).toEqual(['pack://icons/media/spells/Fireball.png']);
    expect(art.spell?.['projectile-fireball']).toBeUndefined();
  });
});
