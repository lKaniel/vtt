import type { Actor, TokenView } from '@vtt/system-dnd5e';
import type { Player } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { MyCharacter } from './session-character.ts';

const ana: Player = { id: 'ana', name: 'Ana', role: 'player', color: '#fff' };
const hero = {
  id: 'hero',
  name: 'Hero',
  stats: { level: 1 },
  ownership: { default: 'limited', ana: 'owner' },
} as unknown as Actor;

function host(tokens: TokenView[], selected?: string) {
  const calls: string[] = [];
  const h = {
    you: ana as Player | undefined,
    selected,
    actors: new Map<string, Actor>(),
    docs: { all: (coll: string) => (coll === 'actors' ? [{ ...hero, type: 'actor', rev: 1 }] : []) },
    tokens: new Map(tokens.map((t) => [t.id, t])),
    select: (id: string | undefined) => calls.push(`select ${id}`),
    focus: (p: [number, number], gently?: boolean) => calls.push(`focus ${p.join(',')}${gently ? ' gently' : ''}`),
  };
  return { part: new MyCharacter(h), calls, h };
}

describe('your character', () => {
  it('is the actor you play, and its token on this scene', () => {
    const { part } = host([{ id: 'hero-1', actor: 'hero', linked: true, x: 5, y: 6 } as TokenView]);
    expect(part.actor()?.id).toBe('hero');
    expect(part.token()?.id).toBe('hero-1');
  });

  it('is picked, and brought into view if it is off screen, when you arrive on a scene with nothing selected', () => {
    const { part, calls } = host([{ id: 'hero-1', actor: 'hero', linked: true, x: 5, y: 6 } as TokenView]);
    part.arrive();
    expect(calls).toEqual(['select hero-1', 'focus 5,6 gently']);
  });

  it('leaves a selection alone, and does nothing when it is not on the scene', () => {
    const tok = { id: 'hero-1', actor: 'hero', linked: true, x: 5, y: 6 } as TokenView;
    const busy = host([tok], 'other');
    busy.h.tokens.set('other', tok);
    busy.part.arrive();
    expect(busy.calls).toEqual([]);
    const away = host([]);
    away.part.arrive();
    expect(away.calls).toEqual([]);
  });
});
