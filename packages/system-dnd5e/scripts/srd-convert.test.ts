import { describe, expect, it } from 'vitest';
import { convertClass, convertMonster, convertSpell, ofType, type Entry, type Pack } from './srd-convert.ts';

function pack(entries: Entry[], text: Record<string, string> = {}): Pack {
  return { entries: new Map(entries.map((e) => [e.id, e])), text };
}

describe('convertSpell', () => {
  it('reads range, area, save, damage, duration and upcasting', () => {
    const fireball: Entry = {
      id: 'spells.fireball',
      type: 'spell',
      fields: {
        level: 3,
        school: 'evocation',
        classes: ['classes.wizard'],
        castingTime: 'action',
        rangeKind: 'ranged',
        range: 150,
        durationUnit: 'instantaneous',
        areaShape: 'sphere',
        areaSize: 20,
        save: 'dex',
        saveEffect: 'half',
        damageType: 'fire',
        damage: '8d6',
        upcastDice: 1,
      },
    };
    const p = pack([fireball], { 'spells.fireball.name': 'Fireball', 'spells.fireball.description': 'Boom.' });
    expect(convertSpell(p, fireball)).toMatchObject({
      id: 'fireball',
      name: 'Fireball',
      classes: ['wizard'],
      range: 150,
      area: { shape: 'sphere', size: 20 },
      save: { ability: 'dex', onSave: 'half' },
      damage: [{ dice: '8d6', type: 'fire' }],
      upcast: { damage: '1d6' },
      duration: 'Instantaneous',
      automated: true,
      description: 'Boom.',
    });
  });

  it('turns lasting effects into effect fields and durations into rounds', () => {
    const bless: Entry = {
      id: 'spells.bless',
      type: 'spell',
      fields: {
        level: 1,
        castingTime: 'bonus-action',
        rangeKind: 'self',
        concentration: true,
        durationUnit: 'minute',
        durationAmount: 1,
        condition: 'conditions.prone',
        upcastTargets: true,
        heal: '1d4',
        healBonus: 2,
        upcastHealDice: 1,
      },
      effects: [
        { target: { rolls: ['attack', 'save'] }, op: 'add', value: '1d4' },
        { target: 'combat.ac', op: 'add', value: 2 },
        { target: 'combat.attackersAdvantage', op: 'set', value: true },
      ],
    };
    expect(convertSpell(pack([bless]), bless)).toMatchObject({
      castingTime: 'bonus',
      range: 0,
      targets: 0,
      rounds: 10,
      duration: 'Concentration, up to 1 minute',
      heal: '1d4+2',
      upcast: { heal: '1d4', targets: 1 },
      effect: { attackBonus: '1d4', saveBonus: '1d4', ac: 2, advantageAgainst: true, conditions: ['prone'] },
    });
  });

  it('marks spells without mechanics as text only', () => {
    const wish: Entry = {
      id: 'spells.wish',
      type: 'spell',
      fields: { level: 9, castingTime: '1-minute', rangeKind: 'touch' },
    };
    expect(convertSpell(pack([wish]), wish)).toMatchObject({ castingTime: 'minute', range: 5, automated: false });
  });
});

describe('convertClass', () => {
  it('takes hit die, saves and features by level', () => {
    const fighter: Entry = {
      id: 'classes.fighter',
      type: 'class',
      fields: { hitDie: '1d10' },
      effects: [{ target: 'proficiencies.saves', op: 'grant', value: { tag: 'save.str' } }],
      grants: [
        { item: 'features.fighter.action-surge', when: 'self.level >= 2' },
        { item: 'features.fighter.second-wind', when: 'self.level >= 1' },
        { item: 'features.ability-score-improvement', when: 'self.level >= 4' },
      ],
    };
    const p = pack([fighter], { 'features.fighter.second-wind.name': 'Second Wind' });
    expect(convertClass(p, fighter)).toMatchObject({
      id: 'fighter',
      hitDie: 10,
      saves: ['str'],
      features: [
        { id: 'second-wind', name: 'Second Wind', level: 1 },
        { id: 'action-surge', level: 2 },
      ],
    });
  });
});

describe('convertMonster', () => {
  it('reads legendary actions, which attack they make, and legendary resistance', () => {
    const dragon: Entry = {
      id: 'monsters.dragon',
      type: 'monster',
      fields: { ac: 18, hp: 200, cr: 10, legendaryActions: 3 },
      grants: [
        { item: 'monsters.dragon.tail' },
        { item: 'monsters.dragon.tail-attack' },
        { item: 'monsters.dragon.wing-attack' },
        { item: 'monsters.dragon.legendary-resistance' },
      ],
    };
    const tail: Entry = {
      id: 'monsters.dragon.tail',
      type: 'monsterAction',
      fields: { attack: 'melee', toHit: 11, reach: 15, damage: '2d8+6', damageType: 'bludgeoning' },
    };
    const tailAttack = {
      id: 'monsters.dragon.tail-attack',
      type: 'monsterAction',
      fields: { kind: 'legendary', legendaryCost: 1 },
      actions: [{ steps: [{ use: 'monster-attack', source: "'monsters.dragon.tail'" }] }],
    } as Entry;
    const wing: Entry = {
      id: 'monsters.dragon.wing-attack',
      type: 'monsterAction',
      fields: { kind: 'legendary', legendaryCost: 2 },
    };
    const resist: Entry = {
      id: 'monsters.dragon.legendary-resistance',
      type: 'monsterAction',
      fields: { kind: 'trait', perDay: 3 },
    };
    const p = pack([dragon, tail, tailAttack, wing, resist], {
      'monsters.dragon.tail.name': 'Tail',
      'monsters.dragon.tail-attack.name': 'Tail Attack',
      'monsters.dragon.wing-attack.name': 'Wing Attack (Costs 2 Actions)',
      'monsters.dragon.wing-attack.description': 'The dragon beats its wings.',
    });
    expect(convertMonster(p, dragon)).toMatchObject({
      legendary: {
        actions: 3,
        options: [
          { id: 'tail-attack', name: 'Tail Attack', cost: 1, attack: 'Tail' },
          { id: 'wing-attack', name: 'Wing Attack', cost: 2, description: 'The dragon beats its wings.' },
        ],
      },
      legendaryResistance: 3,
    });
  });

  it('reads every sense, with darkvision', () => {
    const dragon: Entry = {
      id: 'monsters.dragon',
      type: 'monster',
      fields: { ac: 18, hp: 200, cr: 10, darkvision: 120, blindsight: 60, tremorsense: 30, truesight: 10 },
    };
    expect(convertMonster(pack([dragon]), dragon)).toMatchObject({
      darkvision: 120,
      blindsight: 60,
      tremorsense: 30,
      truesight: 10,
    });
  });

  it('builds a stat block with attacks, thrown weapons and defenses', () => {
    const ogre: Entry = {
      id: 'monsters.ogre',
      type: 'monster',
      fields: {
        size: 'large',
        creatureType: 'giant',
        ac: 11,
        hp: 59,
        speed: 40,
        str: 19,
        dex: 8,
        con: 16,
        int: 5,
        wis: 7,
        cha: 7,
        cr: 2,
        saves: ['save.con'],
        damageResistances: ['damage.nonmagical', 'damage.fire'],
        entries: ['monsters.ogre.javelin', 'monsters.ogre.bite'],
      },
    };
    const javelin: Entry = {
      id: 'monsters.ogre.javelin',
      type: 'monsterAction',
      fields: {
        attack: 'melee',
        toHit: 6,
        reach: 5,
        normalRange: 30,
        longRange: 120,
        damage: '2d6 + 4',
        damageType: 'piercing',
      },
    };
    const bite: Entry = {
      id: 'monsters.ogre.bite',
      type: 'monsterAction',
      fields: {
        attack: 'melee',
        toHit: 6,
        reach: 0,
        damage: '1d6',
        damageType: 'piercing',
        saveDamage: '2d8',
        saveDamageType: 'poison',
      },
    };
    const p = pack([ogre, javelin, bite], { 'monsters.ogre.name': 'Ogre', 'monsters.ogre.javelin.name': 'Javelin' });
    expect(ofType(p, 'monster')).toEqual([ogre]);
    expect(convertMonster(p, ogre)).toMatchObject({
      id: 'ogre',
      name: 'Ogre',
      size: 2,
      type: 'giant',
      saves: ['con'],
      resistances: ['bludgeoning', 'piercing', 'slashing', 'fire'],
      attacks: [
        { name: 'Javelin', kind: 'melee', reach: 5, damage: [{ dice: '2d6+4', type: 'piercing' }] },
        { name: 'Javelin (thrown)', kind: 'ranged', range: [30, 120] },
        { name: 'bite', reach: 5, damage: [{ dice: '1d6' }, { dice: '2d8', type: 'poison' }] },
      ],
    });
  });
});
