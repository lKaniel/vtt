import { describe, expect, it } from 'vitest';
import { inviteCode, inviteLink, lastPlayedText } from './lobby.ts';

describe('invite links', () => {
  it('are this page with the invite route', () => {
    expect(inviteLink('https://table:3000/?x=1#/games/lost-mine', 'aB3_x-9')).toBe(
      'https://table:3000/#/invite/aB3_x-9',
    );
  });

  it('give back their code, pasted whole or as the code alone', () => {
    expect(inviteCode('https://table:3000/#/invite/aB3_x-9')).toBe('aB3_x-9');
    expect(inviteCode('  aB3_x-9 ')).toBe('aB3_x-9');
    expect(inviteCode('')).toBe('');
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
