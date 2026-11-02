import { describe, expect, it } from 'vitest';
import { contentPieces } from './content-links.ts';

describe('content links', () => {
  it('reads our own links, with or without a label', () => {
    expect(contentPieces('See @journal[the-well#map]{the map} and @actor[bram].')).toEqual([
      { text: 'See ' },
      { link: { kind: 'journal', id: 'the-well', page: 'map' }, label: 'the map' },
      { text: ' and ' },
      { link: { kind: 'actor', id: 'bram' } },
      { text: '.' },
    ]);
    expect(contentPieces('@spell[fireball]{Fireball}')).toEqual([
      { link: { kind: 'spell', id: 'fireball' }, label: 'Fireball' },
    ]);
  });

  it("reads Foundry's links: entries, pages, actors, and compendium content by its name", () => {
    expect(contentPieces('@UUID[JournalEntry.abc.JournalEntryPage.def]{Lore}')).toEqual([
      { link: { kind: 'journal', id: 'abc', page: 'def' }, label: 'Lore' },
    ]);
    expect(contentPieces('@Actor[xyz]{Ogre}')).toEqual([{ link: { kind: 'actor', id: 'xyz' }, label: 'Ogre' }]);
    expect(contentPieces('@UUID[Compendium.dnd5e.spells.Item.k3]{Magic Missile}')).toEqual([
      { link: { kind: 'spell', id: 'magic-missile' }, label: 'Magic Missile' },
    ]);
    expect(contentPieces('@UUID[Compendium.world.rules.JournalEntry.q]{Rules}')).toEqual([{ text: 'Rules' }]);
    expect(contentPieces('@Embed[x]')).toEqual([{ text: 'x' }]);
  });

  it('reads inline rolls and checks', () => {
    expect(contentPieces('Take [[/r 2d6+3]] damage, [[1d4]]{a bit}.')).toEqual([
      { text: 'Take ' },
      { roll: '/r 2d6+3', label: '2d6+3' },
      { text: ' damage, ' },
      { roll: '/r 1d4', label: 'a bit' },
      { text: '.' },
    ]);
    expect(contentPieces('[[/gmr 1d20 # secret]]')).toEqual([{ roll: '/gmr 1d20', label: '1d20' }]);
    expect(contentPieces('[[/damage 2d6 fire]]')).toEqual([{ roll: '/r 2d6', label: '2d6 fire' }]);
    expect(contentPieces('[[/check perception 15]] or [[/check dex dc=12]]')).toEqual([
      { check: { name: 'perception', dc: 15 }, label: 'DC 15 Perception' },
      { text: ' or ' },
      { check: { name: 'dex', dc: 12 }, label: 'DC 12 Dex' },
    ]);
    expect(contentPieces('[[/save wis 13]]')).toEqual([{ text: 'DC 13 Wis save' }]);
    expect(contentPieces('[[not dice]]')).toEqual([{ text: 'not dice' }]);
  });

  it('leaves plain text alone', () => {
    expect(contentPieces('Nothing here.')).toEqual([{ text: 'Nothing here.' }]);
    expect(contentPieces('')).toEqual([]);
  });
});
