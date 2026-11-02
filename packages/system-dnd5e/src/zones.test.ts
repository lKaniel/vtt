import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { TokenSchema } from './token-schema.ts';
import { withChoice } from './spell-options.ts';
import { inZone, lastingEffects, zonePlacements, zonesOf, zoneTemplate } from './zones.ts';

// Lasting zones: who is in one, and the template it shows as. 100 px squares.

const spell = (id: string) => srdFor('2014').spells.get(id)!;
const cleric = TokenSchema.parse({
  id: 'cleric',
  name: 'Cleric',
  x: 150,
  y: 150,
  ownership: { default: 'limited', ana: 'owner' },
});
const ally = TokenSchema.parse({
  id: 'ally',
  name: 'Ally',
  x: 250,
  y: 150,
  ownership: { default: 'limited', bo: 'owner' },
});
const goblin = TokenSchema.parse({ id: 'goblin', name: 'Goblin', x: 250, y: 150 });

function zoneOf(id: string, point?: [number, number]) {
  const effects = lastingEffects(cleric, spell(id), 3, point);
  return zonesOf([{ ...cleric, effects }])[0]!;
}

describe('lasting zones', () => {
  it('remember the spell, its slot and the option chosen on casting', () => {
    const chosen = { ...spell('spiritual-weapon'), chosen: 'fist' };
    const [repeat] = lastingEffects(cleric, chosen, 4);
    expect(repeat).toMatchObject({ spell: 'spiritual-weapon', slot: 4, repeat: { slot: 4, choice: 'fist' } });
  });

  it('catch foes around the caster of spirit guardians, sparing allies and the caster', () => {
    const z = zoneOf('spirit-guardians');
    const s = spell('spirit-guardians');
    expect(inZone(z, s, { token: goblin, at: [250, 150], gridSize: 100 })).toBe(true);
    expect(inZone(z, s, { token: goblin, at: [1250, 150], gridSize: 100 })).toBe(false);
    expect(inZone(z, s, { token: ally, at: [250, 150], gridSize: 100 })).toBe(false);
    expect(inZone(z, s, { token: cleric, at: [150, 150], gridSize: 100 })).toBe(false);
  });

  it('show spirit guardians round its caster and moonbeam where it was aimed', () => {
    expect(zoneTemplate(zoneOf('spirit-guardians'), spell('spirit-guardians'))).toEqual({
      shape: 'circle',
      x: 150,
      y: 150,
      distance: 17.5,
      attachedTo: 'cleric',
    });
    expect(zoneTemplate(zoneOf('moonbeam', [550, 150]), spell('moonbeam'))).toEqual({
      shape: 'circle',
      x: 550,
      y: 150,
      distance: 5,
    });
  });
});

describe('what a lasting area puts on the map', () => {
  const placed = (id: string, point: [number, number], choice?: string) => {
    const s = choice ? withChoice(spell(id), choice) : spell(id);
    const effects = lastingEffects(cleric, s, s.level, point);
    return zonePlacements(zonesOf([{ ...cleric, effects }])[0]!, s, 100);
  };

  it('darkness puts magical darkness as wide as its sphere where it was cast', () => {
    expect(placed('darkness', [550, 150]).light).toMatchObject({ x: 550, y: 150, bright: 15, darkness: true });
    expect(placed('darkness', [550, 150]).walls).toEqual([]);
  });

  it('daylight puts bright light with dim light beyond', () => {
    expect(placed('daylight', [550, 150]).light).toMatchObject({ bright: 60, dim: 60 });
  });

  it('a wall of stone stands across the line from its caster, centred where it was cast', () => {
    const { walls } = placed('wall-of-stone', [1150, 150]);
    // 100 ft = 2000 px at 100 px squares, square to the caster's line of sight (along y).
    expect(walls).toEqual([{ a: [1150, 1150], b: [1150, -850] }]);
  });

  it('a wall of force can close as a dome: a ring of invisible wall that stops movement only', () => {
    const { walls, rules } = placed('wall-of-force', [1150, 150], 'dome');
    expect(walls.length).toBeGreaterThanOrEqual(12);
    expect(rules).toMatchObject({ sight: 'none', light: 'none' });
    for (const w of walls) expect(Math.hypot(w.a[0] - 1150, w.a[1] - 150)).toBeCloseTo(200);
  });
});
