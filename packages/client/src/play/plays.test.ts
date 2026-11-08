import type { Actor } from '@vtt/system-dnd5e';
import type { Player } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { playsChoices } from './plays.ts';

const bo: Player = { id: 'bo', name: 'Bo', role: 'player', color: '#fff' };
const actor = (id: string, more: Partial<Actor> = {}): Actor => ({ id, name: id, ...more }) as Actor;

describe('what a seat may be given to play', () => {
  it('lists characters, then the other creatures, each ticked when the seat owns it', () => {
    const mira = actor('mira', { stats: { level: 1 } });
    const ana = actor('ana-hero', { stats: { level: 1 } });
    const wolf = actor('wolf', { monster: 'wolf', ownership: { default: 'limited', bo: 'owner' } });
    const goblin = actor('goblin', { monster: 'goblin' });
    const out = playsChoices({ ...bo, character: 'mira' }, [wolf, mira, goblin, ana]);
    expect(out.characters.map((c) => [c.id, c.plays, c.main])).toEqual([
      ['ana-hero', false, false],
      ['mira', false, true],
    ]);
    expect(out.others.map((c) => [c.id, c.plays])).toEqual([
      ['goblin', false],
      ['wolf', true],
    ]);
    expect(out.names).toEqual(['wolf']);
  });
});
