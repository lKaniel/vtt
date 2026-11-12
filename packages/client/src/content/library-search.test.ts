import { describe, expect, it } from 'vitest';
import { libraryTags, searchLibrary } from './library-search.ts';

const entries = [
  { id: 'lamp', name: 'LIGHTING Street Lamppost', tags: ['lighting', 'town'] },
  { id: 'tent', name: 'Tent Camping Overhead', tags: ['camping', 'nature'] },
  { id: 'rocks', name: 'Brush: Stalagmites', tags: ['caves', 'nature'] },
  { id: 'plain', name: 'Barrel' },
];

describe('searching the Baileywiki library', () => {
  it('finds entries by every word typed, in names and tags', () => {
    expect(searchLibrary(entries, 'street lamp', []).map((e) => e.id)).toEqual(['lamp']);
    expect(searchLibrary(entries, 'nature', []).map((e) => e.id)).toEqual(['tent', 'rocks']);
    expect(searchLibrary(entries, '', []).map((e) => e.id)).toEqual(['lamp', 'tent', 'rocks', 'plain']);
  });

  it('keeps those with every picked tag', () => {
    expect(searchLibrary(entries, '', ['nature', 'caves']).map((e) => e.id)).toEqual(['rocks']);
  });

  it('offers the commonest tags first', () => {
    expect(libraryTags(entries, 2)).toEqual(['nature', 'camping']);
  });
});
