import type { Player } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { foundryPlayers } from './foundry-users.ts';

const gm: Player = { id: 'gamemaster', name: 'Gamemaster', role: 'gm', color: '#e0b040' };
const media = (p: string) => (p.startsWith('icons/') ? undefined : `/assets/foundry/${p}`);

const users = [
  { _id: 'G', name: 'Gamemaster', role: 4, color: '#cc2869' },
  { _id: 'A', name: 'MAKSIM', role: 2, color: '#8318aa', avatar: 'tokenizer/maks.webp', password: 'x' },
  { _id: 'B', name: 'Player 12', role: 1, color: 'teal', avatar: 'icons/svg/mystery-man.svg' },
  { _id: 'C', name: 'Helper', role: 3 },
  { _id: 'D', name: 'Maksim', role: 2 },
];

describe('foundryPlayers', () => {
  it("makes Foundry's users the game's players, the first gamemaster being the importer", () => {
    const { players } = foundryPlayers(users, gm, media);
    expect(players).toEqual([
      gm,
      {
        id: 'maksim',
        name: 'MAKSIM',
        role: 'trusted',
        color: '#8318aa',
        avatar: '/assets/foundry/tokenizer/maks.webp',
      },
      { id: 'player-12', name: 'Player 12', role: 'player', color: '#8a8a8a' },
      { id: 'helper', name: 'Helper', role: 'gm', color: '#8a8a8a' },
      { id: 'maksim-2', name: 'Maksim', role: 'trusted', color: '#8a8a8a' },
    ]);
  });

  it('gives each player the level Foundry gave its user, leaving the GMs out (they own everything)', () => {
    const { ownership } = foundryPlayers(users, gm, media);
    expect(ownership({ default: 0, G: 3, A: 3, B: 2, C: 3, Z: 3 }, 'none')).toEqual({
      default: 'none',
      maksim: 'owner',
      'player-12': 'observer',
    });
    expect(ownership({ default: 2, A: 1 }, 'none')).toEqual({ default: 'observer', maksim: 'limited' });
    expect(ownership(undefined, 'none')).toBeUndefined();
    expect(ownership({ default: 0 }, 'none')).toBeUndefined();
  });

  it('keeps a missing default at the collection’s own default', () => {
    const { ownership } = foundryPlayers(users, gm, media);
    expect(ownership({ default: 1, A: 3 }, 'limited')).toEqual({ default: 'limited', maksim: 'owner' });
    expect(ownership({ default: 1 }, 'limited')).toBeUndefined();
  });
});
