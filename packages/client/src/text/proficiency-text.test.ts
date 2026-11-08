import { srdFor } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { addableProficiencies, groupProficiencies } from './proficiency-text.ts';

const book = srdFor('2014');

describe('proficiencies on a sheet', () => {
  it('groups them by kind with their names, old words last', () => {
    const groups = groupProficiencies(['elvish', 'Juggling', 'light-armor', 'thieves-tools', 'longsword'], book);
    expect(groups).toEqual([
      { kind: 'armor', items: [{ id: 'light-armor', name: 'Light armor' }] },
      { kind: 'weapon', items: [{ id: 'longsword', name: 'Longsword' }] },
      { kind: 'tool', items: [{ id: 'thieves-tools', name: "Thieves' Tools", ability: 'dex' }] },
      { kind: 'language', items: [{ id: 'elvish', name: 'Elvish' }] },
      { kind: 'other', items: [{ id: 'Juggling', name: 'Juggling' }] },
    ]);
  });

  it('reads old words as the proficiency they name', () => {
    expect(groupProficiencies(['Thieves’ tools'], book)[0]).toMatchObject({ kind: 'tool' });
  });

  it('offers what the creature does not have yet, by kind', () => {
    const groups = addableProficiencies(['elvish', 'light-armor'], book);
    expect(groups.map((g) => g.kind)).toEqual(['armor', 'weapon', 'tool', 'language']);
    const all = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(all).not.toContain('elvish');
    expect(all).toContain('dwarvish');
  });
});
