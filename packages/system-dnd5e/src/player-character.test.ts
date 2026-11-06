import { describe, expect, it } from 'vitest';
import type { Player } from '@vtt/shared';
import { characterOf } from './player-character.ts';
import type { Actor } from './token-schema.ts';

const actor = (id: string, extra: Partial<Actor> = {}): Actor => ({
  id,
  name: id,
  size: 1,
  color: '#000',
  speed: 30,
  darkvision: 0,
  hidden: false,
  ...extra,
});
const ana: Player = { id: 'ana', name: 'Ana', role: 'player', color: '#fff' };
const owns = (...ids: string[]) =>
  ({ ownership: { default: 'limited', ...Object.fromEntries(ids.map((i) => [i, 'owner'])) } }) as Partial<Actor>;
const hero = actor('hero', { ...owns('ana'), stats: { level: 3, class: 'fighter' } });

describe("a player's character", () => {
  it('is the one their seat names, when it is there', () => {
    const named = actor('named', owns('bo'));
    expect(characterOf({ ...ana, character: 'named' }, [hero, named])?.id).toBe('named');
    expect(characterOf({ ...ana, character: 'gone' }, [hero])?.id).toBe('hero');
  });

  it('else the character they alone own, before ones they share and before monsters', () => {
    const shared = actor('shared', { ...owns('ana', 'bo'), stats: { level: 5, class: 'wizard' } });
    const bear = actor('bear', { ...owns('ana'), monster: 'brown-bear' });
    expect(characterOf(ana, [bear, shared, hero])?.id).toBe('hero');
    expect(characterOf(ana, [bear, shared])?.id).toBe('shared');
    expect(characterOf(ana, [bear])).toBeUndefined();
  });

  it('is nobody for the GM, or for someone who owns no character', () => {
    expect(characterOf({ ...ana, role: 'gm' }, [hero])).toBeUndefined();
    expect(characterOf({ ...ana, id: 'bo' }, [hero])).toBeUndefined();
  });
});
