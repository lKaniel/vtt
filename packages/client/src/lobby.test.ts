import { describe, expect, it } from 'vitest';
import { bringFirst, gameRoute, inviteLink, lastPlayedText } from './lobby.ts';

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

describe('an invite link', () => {
  it("opens the game's join screen, with the player picked when it names one", () => {
    expect(inviteLink('https://vtt.example.com/', 'lost-mine')).toBe('https://vtt.example.com/#/join/lost-mine');
    expect(inviteLink('https://vtt.example.com', 'lost-mine', 'mira b')).toBe(
      'https://vtt.example.com/#/join/lost-mine/mira%20b',
    );
  });
});

describe('the character to bring', () => {
  const chars = [{ id: 'mira' }, { id: 'vex' }];
  it("is a player's first character, and none for a GM or someone without one", () => {
    expect(bringFirst('player', chars)).toBe('mira');
    expect(bringFirst('trusted', chars)).toBe('mira');
    expect(bringFirst('gm', chars)).toBe('');
    expect(bringFirst('player', [])).toBe('');
    expect(bringFirst(null, chars)).toBe('');
  });
});
