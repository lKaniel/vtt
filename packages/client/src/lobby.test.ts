import { describe, expect, it } from 'vitest';
import { gameRoute, lastPlayedText } from './lobby.ts';

describe('a game card', () => {
  it('leads to the join screen until you joined, then to the game page', () => {
    expect(gameRoute({ id: 'lost-mine', you: null })).toEqual({ name: 'join', game: 'lost-mine' });
    expect(gameRoute({ id: 'lost-mine', you: 'player' })).toEqual({ name: 'game', game: 'lost-mine' });
  });
});

describe('last played', () => {
  const now = Date.UTC(2026, 10, 1, 12);
  it('reads like a person would say it', () => {
    expect(lastPlayedText(undefined, now)).toBe('Not played yet');
    expect(lastPlayedText(now - 30_000, now)).toBe('Played just now');
    expect(lastPlayedText(now - 3 * 3_600_000, now)).toBe('Played 3 hours ago');
    expect(lastPlayedText(now - 86_400_000, now)).toBe('Played yesterday');
    expect(lastPlayedText(now - 5 * 86_400_000, now)).toBe('Played 5 days ago');
  });
});
