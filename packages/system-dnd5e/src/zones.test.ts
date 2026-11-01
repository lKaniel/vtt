import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { TokenSchema } from './token-schema.ts';
import { inZone, lastingEffects, zonesOf, zoneTemplate } from './zones.ts';

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
