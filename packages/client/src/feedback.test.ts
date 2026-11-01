import type { AttackLog, ChatMessage, SpellLog, SpellTargetLog } from '@vtt/system-dnd5e';
import type { Roll } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { cuesOf, elementColor, IMPACT, type Cue } from './feedback.ts';

const roll = (total: number): Roll => ({ formula: '1d20', terms: [], total });

function attack(over: Partial<AttackLog> = {}): AttackLog {
  return {
    attacker: 'Hero',
    target: 'Goblin',
    attackerId: 'hero',
    targetId: 'goblin',
    kind: 'melee',
    attack: 'Longsword',
    d20: roll(15),
    hit: true,
    crit: false,
    damage: 7,
    parts: [{ roll: roll(7), type: 'slashing', dealt: 7 }],
    notes: [],
    ...over,
  };
}

const hitOn = (target: string, over: Partial<SpellTargetLog> = {}): SpellTargetLog => ({
  target,
  targetId: target,
  damage: 0,
  ...over,
});

function spell(over: Partial<SpellLog> = {}): SpellLog {
  return {
    caster: 'Wiz',
    spell: 'Fire Bolt',
    casterId: 'wiz',
    spellId: 'fire-bolt',
    damageType: 'fire',
    attackKind: 'ranged',
    slot: 0,
    results: [hitOn('goblin', { hit: true, damage: 6 })],
    notes: [],
    ...over,
  };
}

const message = (body: Partial<ChatMessage>): ChatMessage => ({ id: '1', time: 0, from: 'GM', color: '#fff', ...body });
const kinds = (cues: Cue[]) => cues.map((c) => c.kind);
const only = <K extends Cue['kind']>(cues: Cue[], kind: K) =>
  cues.filter((c): c is Extract<Cue, { kind: K }> => c.kind === kind);

describe('melee attacks', () => {
  it('lunge, slash, then the hit lands with its damage', () => {
    const cues = cuesOf(message({ attack: attack() }));
    expect(kinds(cues)).toEqual(['lunge', 'slash', 'impact', 'number']);
    expect(cues[0]).toMatchObject({ at: 0, token: 'hero', toward: 'goblin' });
    expect(cues[1]).toMatchObject({ from: 'hero', to: 'goblin', element: 'steel' });
    const [impact] = only(cues, 'impact');
    const [number] = only(cues, 'number');
    expect(impact).toMatchObject({ token: 'goblin', at: IMPACT.melee });
    expect(number).toMatchObject({ token: 'goblin', text: '7', tone: 'damage', at: IMPACT.melee });
  });

  it('a critical hit gets the crit tone', () => {
    const [number] = only(cuesOf(message({ attack: attack({ crit: true, damage: 15 }) })), 'number');
    expect(number).toMatchObject({ text: '15', tone: 'crit' });
  });

  it('a miss shows "Miss" and nothing lands', () => {
    const cues = cuesOf(message({ attack: attack({ hit: false, damage: 0 }) }));
    expect(only(cues, 'impact')).toEqual([]);
    expect(only(cues, 'number')[0]).toMatchObject({ text: 'Miss', tone: 'miss' });
  });

  it('a magic weapon glows in the colour of its extra damage', () => {
    const parts = [
      { roll: roll(5), type: 'slashing' as const, dealt: 5 },
      { roll: roll(3), type: 'fire' as const, dealt: 3 },
    ];
    expect(only(cuesOf(message({ attack: attack({ parts }) })), 'slash')[0]!.element).toBe('fire');
  });
});

describe('ranged attacks', () => {
  it('an arrow flies and the hit lands when it arrives', () => {
    const cues = cuesOf(message({ attack: attack({ kind: 'ranged', parts: [] }) }));
    expect(kinds(cues)).toEqual(['missile', 'impact', 'number']);
    expect(cues[0]).toMatchObject({ from: 'hero', to: 'goblin', style: 'arrow', duration: IMPACT.arrow });
    expect(cues[1]!.at).toBe(IMPACT.arrow);
  });
});

describe('spells', () => {
  it('a spell attack channels, flies as an orb and lands in its element', () => {
    const cues = cuesOf(message({ spell: spell() }));
    expect(kinds(cues)).toEqual(['channel', 'missile', 'impact', 'number']);
    expect(cues[0]).toMatchObject({ token: 'wiz', element: 'fire' });
    expect(cues[1]).toMatchObject({ style: 'orb', element: 'fire', to: 'goblin' });
    expect(cues[2]!.at).toBe(cues[1]!.at + IMPACT.orb);
  });

  it('several darts fly one after another', () => {
    const darts = [1, 2, 3].map(() => hitOn('goblin', { damage: 3 }));
    const cues = cuesOf(message({ spell: spell({ attackKind: undefined, damageType: 'force', results: darts }) }));
    const starts = only(cues, 'missile').map((c) => c.at);
    expect(new Set(starts).size).toBe(3);
  });

  it('a melee spell attack is a slash in its element', () => {
    const cues = cuesOf(message({ spell: spell({ attackKind: 'melee', damageType: 'lightning' }) }));
    expect(only(cues, 'slash')[0]).toMatchObject({ element: 'lightning' });
    expect(only(cues, 'missile')).toEqual([]);
  });

  it('a fireball flies to its point and bursts over everyone inside at once', () => {
    const results = [hitOn('a', { damage: 8 }), hitOn('b', { damage: 4, save: save(true) })];
    const log = spell({
      attackKind: undefined,
      point: [300, 200],
      area: { shape: 'sphere', size: 20, width: 5 },
      results,
    });
    const cues = cuesOf(message({ spell: log }));
    const [burst] = only(cues, 'burst');
    expect(only(cues, 'missile')[0]).toMatchObject({ to: [300, 200] });
    expect(burst).toMatchObject({ where: [300, 200], radius: 20, element: 'fire' });
    expect(only(cues, 'impact').map((c) => c.at)).toEqual([burst!.at, burst!.at]);
  });

  it('a cone sprays from the caster toward the point', () => {
    const log = spell({ attackKind: undefined, point: [300, 200], area: { shape: 'cone', size: 15, width: 5 } });
    expect(only(cuesOf(message({ spell: log })), 'spray')[0]).toMatchObject({
      from: 'wiz',
      to: [300, 200],
      length: 15,
    });
  });

  it('an emanation bursts around the caster', () => {
    const log = spell({ attackKind: undefined, area: { shape: 'emanation', size: 10, width: 5 } });
    expect(only(cuesOf(message({ spell: log })), 'burst')[0]).toMatchObject({ where: 'wiz', radius: 10 });
  });

  it('healing glows green with a plus number and no flinch', () => {
    const log = spell({ damageType: undefined, attackKind: undefined, results: [hitOn('hero', { healed: 8 })] });
    const cues = cuesOf(message({ spell: log }));
    expect(only(cues, 'glow')[0]).toMatchObject({ token: 'hero', element: 'heal' });
    expect(only(cues, 'number')[0]).toMatchObject({ text: '+8', tone: 'heal' });
    expect(only(cues, 'impact')).toEqual([]);
  });

  it('names the effect it leaves, or says the target saved', () => {
    const held = spell({
      damageType: undefined,
      attackKind: undefined,
      results: [hitOn('a', { effect: 'Hold Person' })],
    });
    expect(only(cuesOf(message({ spell: held })), 'number')[0]).toMatchObject({ text: 'Hold Person', tone: 'note' });
    const saved = spell({ damageType: undefined, attackKind: undefined, results: [hitOn('a', { save: save(true) })] });
    expect(only(cuesOf(message({ spell: saved })), 'number')[0]).toMatchObject({ text: 'Saved', tone: 'miss' });
    const immune = spell({ results: [hitOn('a', { immune: true })] });
    expect(only(cuesOf(message({ spell: immune })), 'number')[0]).toMatchObject({ text: 'Immune', tone: 'miss' });
  });

  it('a teleport puffs where the caster lands', () => {
    const log = spell({ damageType: undefined, attackKind: undefined, point: [500, 500], results: [] });
    expect(only(cuesOf(message({ spell: log })), 'burst')[0]).toMatchObject({ where: [500, 500], element: 'arcane' });
  });
});

describe('other messages', () => {
  it('plain chat plays nothing', () => {
    expect(cuesOf(message({ text: 'hello' }))).toEqual([]);
  });

  it('every element has a colour', () => {
    expect(elementColor('fire')).not.toBe(elementColor('cold'));
    expect(elementColor('steel')).toBeTypeOf('number');
  });
});

function save(success: boolean) {
  return { ability: 'dex' as const, dc: 15, total: success ? 18 : 5, success };
}
