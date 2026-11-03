import { describe, expect, it } from 'vitest';
import { isProp, looseActors, propsOf } from './foundry-props.ts';

// Baileywiki builds maps from tokens with no actor (trees, torches, wagons),
// so Token Attacher can move them: here they are tiles (and the light a
// torch sheds). Creatures whose actor stayed in a compendium get one.

const media = (p: string) => `/assets/foundry/${p}`;
const tree = {
  _id: 'K1',
  name: 'tree',
  actorId: null,
  x: 200,
  y: 100,
  width: 2,
  height: 3,
  hidden: true,
  texture: { src: 'modules/baileywiki-maps-premium-towns/maps/props/tree.webp' },
};
const torch = {
  _id: 'K2',
  name: 'torch',
  x: 0,
  y: 0,
  texture: { src: 'modules/baileywiki-maps-premium-towns/maps/props/torch.webp' },
  light: { bright: 10, dim: 20, color: '#ff9a40' },
};
const goblin = { _id: 'K3', name: 'Goblin', actorId: 'gone', texture: { src: 'systems/dnd5e/tokens/goblin.webp' } };
const lory = { _id: 'K4', name: 'Lory', texture: { src: 'tokenizer/pc-images/lory.webp' } };

describe('props placed as tokens', () => {
  it('tells scenery from creatures by its picture', () => {
    expect([tree, torch, goblin, lory].map((t) => isProp(t))).toEqual([true, true, false, false]);
  });

  it('makes tiles of them, and lights of the light they shed', () => {
    const { tiles, lights } = propsOf([tree, torch], { grid: 100, media, feet: (u) => u });
    expect(tiles).toEqual([
      {
        kind: 'image',
        x: 200,
        y: 100,
        w: 200,
        h: 300,
        src: '/assets/foundry/modules/baileywiki-maps-premium-towns/maps/props/tree.webp',
        hidden: true,
      },
      {
        kind: 'image',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        src: '/assets/foundry/modules/baileywiki-maps-premium-towns/maps/props/torch.webp',
      },
    ]);
    expect(lights).toEqual([expect.objectContaining({ x: 50, y: 50, bright: 10, dim: 20, color: '#ff9a40' })]);
  });

  it('gives creatures without an actor one actor per name, with their picture', () => {
    const scenes = [{ tokens: [tree, goblin, lory, { ...goblin, _id: 'K5' }] }];
    expect(looseActors(scenes, () => false)).toEqual([
      {
        _id: 'loose-goblin',
        name: 'Goblin',
        type: 'npc',
        img: 'systems/dnd5e/tokens/goblin.webp',
        prototypeToken: { texture: { src: 'systems/dnd5e/tokens/goblin.webp' }, width: 1, actorLink: false },
        system: {},
      },
      {
        _id: 'loose-lory',
        name: 'Lory',
        type: 'npc',
        img: 'tokenizer/pc-images/lory.webp',
        prototypeToken: { texture: { src: 'tokenizer/pc-images/lory.webp' }, width: 1, actorLink: false },
        system: {},
      },
    ]);
  });
});
