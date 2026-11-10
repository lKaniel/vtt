import { describe, expect, it } from 'vitest';
import { monsterExtras } from './monster-convert.ts';
import type { Entry, Pack } from './srd-convert.ts';

const pack = (entries: Entry[], text: Record<string, string> = {}): Pack => ({
  entries: new Map(entries.map((e) => [e.id, e])),
  text,
});

const action = (id: string, fields: Record<string, unknown>, more: object = {}): Entry => ({
  id: `monsters.dragon.${id}`,
  type: 'monsterAction',
  fields,
  ...more,
});

const refsOf = (entries: Entry[]) => entries.map((e) => e.id);

describe('monsterExtras', () => {
  it('counts the attacks of Multiattack', () => {
    const steps = ['bite', 'claw', 'claw'].map((a) => ({ use: 'monster-attack', source: `'monsters.dragon.${a}'` }));
    const multi = action('multiattack', { order: 2 }, { actions: [{ steps }] });
    expect(monsterExtras(pack([multi]), {}, refsOf([multi]))).toMatchObject({ multiattack: 3 });
  });

  it('counts the attacks the words of Multiattack add up to, not what it may do instead', () => {
    const multi = action('multiattack', { kind: 'action' });
    const count = (description: string) =>
      monsterExtras(pack([multi], { 'monsters.dragon.multiattack.description': description }), {}, refsOf([multi]))
        .multiattack;
    expect(count('The mage makes three Arcane Burst attacks.')).toBe(3);
    expect(count('The dragon can use its Frightful Presence. It then makes three attacks: one with its bite.')).toBe(3);
    expect(count('The devil makes two Claw attacks and one Infernal Sting attack.')).toBe(3);
    expect(count('The gladiator makes three melee attacks or two ranged attacks.')).toBe(3);
    expect(
      count('The medusa makes two Claw attacks and one Snake Hair attack, or it makes three Poison Ray attacks.'),
    ).toBe(3);
    expect(count('The vampire makes two attacks, only one of which can be a bite attack.')).toBe(2);
    expect(count('The lich makes three attacks, using Eldritch Burst or Paralyzing Touch in any combination.')).toBe(3);
    expect(count('The hydra makes as many Bite attacks as it has heads.')).toBeUndefined();
  });

  it('drops the uses from a name', () => {
    const enslave = action('enslave', { save: 'wis', saveDc: 14, condition: 'conditions.charmed', perDay: 3 });
    const p = pack([enslave], { 'monsters.dragon.enslave.name': 'Enslave (3/Day)' });
    expect(monsterExtras(p, {}, refsOf([enslave])).features?.[0]).toMatchObject({ name: 'Enslave', uses: [[1, 3]] });
  });

  it('keeps traits and other actions it cannot run as text, in order', () => {
    const tactics = action('pack-tactics', { kind: 'trait', order: 1 });
    const shape = action('change-shape', { order: 2 });
    const parry = action('parry', { kind: 'reaction', order: 3 });
    const p = pack([tactics, shape, parry], {
      'monsters.dragon.pack-tactics.name': 'Pack Tactics',
      'monsters.dragon.pack-tactics.description': 'Advantage with an ally near.',
      'monsters.dragon.change-shape.name': 'Change Shape',
      'monsters.dragon.change-shape.description': 'It polymorphs.',
      'monsters.dragon.parry.name': 'Parry',
      'monsters.dragon.parry.description': 'Adds 2 to AC.',
    });
    expect(monsterExtras(p, {}, refsOf([tactics, shape, parry])).traits).toEqual([
      { name: 'Pack Tactics', description: 'Advantage with an ally near.' },
      { name: 'Change Shape', description: 'It polymorphs.', kind: 'action' },
      { name: 'Parry', description: 'Adds 2 to AC.', kind: 'reaction' },
    ]);
  });

  it('turns a 2014 breath weapon into a feature aimed like a spell, with its recharge', () => {
    const breath = action('fire-breath', {
      save: 'dex',
      saveDc: 21,
      saveDamage: '18d6',
      saveDamageType: 'fire',
      saveEffect: 'half',
      areaShape: 'cone',
      areaSize: 60,
      recharge: 5,
    });
    const p = pack([breath], {
      'monsters.dragon.fire-breath.name': 'Fire Breath',
      'monsters.dragon.fire-breath.description': 'The dragon exhales fire.',
    });
    expect(monsterExtras(p, {}, refsOf([breath])).features).toEqual([
      {
        id: 'fire-breath',
        name: 'Fire Breath',
        level: 1,
        description: 'The dragon exhales fire.',
        action: 'action',
        uses: [[1, 1]],
        rechargeOn: 5,
        spell: {
          targets: 1,
          range: 0,
          area: { shape: 'cone', size: 60 },
          save: { ability: 'dex', dc: 21, onSave: 'half' },
          damage: [{ dice: '18d6', type: 'fire' }],
        },
      },
    ]);
  });

  it('turns a 2024 save action into a feature: its damage, line width, bonus action and uses a day', () => {
    const bolt = action('lightning', {
      kind: 'bonus-action',
      perDay: 2,
      save: 'dex',
      saveDc: 15,
      damage: '4d10',
      damageType: 'lightning',
      areaShape: 'line',
      areaSize: 60,
      areaWidth: 10,
    });
    const [feature] = monsterExtras(pack([bolt]), {}, refsOf([bolt])).features ?? [];
    expect(feature).toMatchObject({
      action: 'bonus',
      uses: [[1, 2]],
      spell: {
        area: { shape: 'line', size: 60, width: 10 },
        save: { ability: 'dex', dc: 15, onSave: 'none' },
        damage: [{ dice: '4d10', type: 'lightning' }],
      },
    });
    expect(feature).not.toHaveProperty('rechargeOn');
  });

  it('a condition behind a save lasts a minute with repeated saves when the text says so, reaching as far as it says', () => {
    const presence = action('frightful-presence', { save: 'wis', saveDc: 19, condition: 'conditions.frightened' });
    const p = pack([presence], {
      'monsters.dragon.frightful-presence.description':
        "Each creature of the dragon's choice that is within 120 feet of the dragon must succeed on a DC 19 Wisdom saving throw or become frightened for 1 minute. A creature can repeat the saving throw at the end of each of its turns.",
    });
    const [feature] = monsterExtras(p, {}, refsOf([presence])).features ?? [];
    expect(feature?.spell).toEqual({
      targets: 20,
      range: 120,
      rounds: 10,
      save: { ability: 'wis', dc: 19, onSave: 'none' },
      damage: [],
      effect: { conditions: ['frightened'], repeatSave: true },
    });
  });

  it('reads how long a condition lasts from the words', () => {
    const glare = action('glare', { save: 'wis', saveDc: 11, condition: 'conditions.frightened' });
    const lasts = (description: string) => {
      const p = pack([glare], { 'monsters.dragon.glare.description': description });
      return (monsterExtras(p, {}, refsOf([glare])).features?.[0]?.spell as { rounds: number }).rounds;
    };
    expect(lasts('Frightened until the end of its next turn. It is then immune for the next 24 hours.')).toBe(1);
    expect(lasts('The target is poisoned and repeats the save at the end of each of its turns.')).toBe(10);
    expect(lasts('The target is charmed for 24 hours.')).toBe(14400);
    expect(lasts('The target is charmed for 1 hour.')).toBe(600);
  });

  it('leaves attacks, legendary actions and save traits out of the features', () => {
    const bite = action('bite', {
      attack: 'melee',
      toHit: 5,
      damage: '1d6',
      damageType: 'piercing',
      save: 'con',
      saveDc: 11,
    });
    const wing = action('wing', {
      kind: 'legendary',
      save: 'dex',
      saveDc: 20,
      damage: '2d6',
      damageType: 'bludgeoning',
    });
    const aura = action('aura', { kind: 'trait', save: 'con', saveDc: 12, damage: '1d6', damageType: 'fire' });
    const out = monsterExtras(pack([bite, wing, aura]), {}, refsOf([bite, wing, aura]));
    expect(out.features).toBeUndefined();
    expect(out.traits?.map((t) => t.name)).toEqual(['aura']);
  });

  it('reads skills, languages, alignment and the other speeds', () => {
    const fields = {
      alignment: 'chaotic-evil',
      skills: ['skill.perception', 'skill.sleight-of-hand'],
      expertise: ['skill.perception'],
      languages: ['languages.common', 'languages.deep-speech'],
      telepathy: 120,
      flySpeed: 80,
      swimSpeed: 40,
      climbSpeed: 30,
      burrowSpeed: 20,
      hover: true,
    };
    expect(monsterExtras(pack([]), fields, [])).toEqual({
      alignment: 'chaotic evil',
      skills: ['perception', 'sleight-of-hand'],
      expertise: ['perception'],
      languages: ['Common', 'Deep Speech', 'telepathy 120 ft.'],
      speeds: { fly: 80, swim: 40, climb: 30, burrow: 20, hover: true },
    });
  });

  it('adds nothing to a plain monster', () => {
    expect(monsterExtras(pack([]), { ac: 12 }, [])).toEqual({});
  });
});
