import { describe, expect, it } from 'vitest';
import { CharacterSchema } from './character.ts';
import { characterOnMap, freeSquare } from './character-token.ts';
import { TokenSchema } from './schema.ts';

const vex = CharacterSchema.parse({
  id: 'vex',
  owner: 'dee',
  name: 'Vex',
  species: 'tiefling',
  class: 'sorcerer',
  background: 'acolyte',
  base: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 },
});

describe('freeSquare', () => {
  it('picks the start square when it is empty, else the nearest empty one', () => {
    expect(freeSquare([130, 160], [], 100)).toEqual([150, 150]);
    expect(freeSquare([150, 150], [[150, 150]], 100)).toEqual([250, 150]);
  });
});

describe('characterOnMap', () => {
  it('places a new token for the character', () => {
    const token = characterOnMap(vex, undefined, [450, 450]);
    expect(token).toMatchObject({ id: 'vex', name: 'Vex', x: 450, y: 450, controllers: ['dee'], darkvision: 60 });
    expect(token).toMatchObject({ actor: 'vex', linked: true });
  });

  it('updates the build of an existing token but keeps how it is doing in play', () => {
    const before = TokenSchema.parse({
      ...characterOnMap(vex, undefined, [450, 450]),
      x: 900,
      hp: 2,
      inventory: [{ item: 'dagger' }],
      controllers: ['dee', 'gm-friend'],
      hotbar: ['spell:fire-bolt'],
    });
    const after = characterOnMap({ ...vex, name: 'Vex the Bold', level: 2 }, before, [0, 0]);
    expect(after).toMatchObject({
      name: 'Vex the Bold',
      x: 900,
      hp: 2,
      inventory: [{ item: 'dagger' }],
      controllers: ['dee', 'gm-friend'],
      hotbar: ['spell:fire-bolt'],
      stats: { level: 2 },
    });
  });
});
