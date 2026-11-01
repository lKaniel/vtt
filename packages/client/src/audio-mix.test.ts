import type { Doc } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { audioMix } from './audio-mix.ts';

// What should be playing, and how loud: the tracks of playing playlists, and
// ambient sounds by how near the listener stands. 100 px squares of 5 ft.

const inn: Doc = {
  id: 'inn',
  type: 'playlist',
  rev: 1,
  name: 'Inn',
  volume: 0.5,
  tracks: [
    { id: 'lute', name: 'Lute', src: 'lute.ogg', playing: true, volume: 0.8 },
    { id: 'harp', name: 'Harp', src: 'harp.ogg' },
  ],
};
const brook: Doc = { id: 'brook', type: 'sound', rev: 1, x: 0, y: 0, radius: 10, src: 'brook.ogg', volume: 1 };

describe('the audio mix', () => {
  const base = { gridSize: 100, darkness: 0, wallsBetween: () => [], level: undefined };

  it('plays the tracks marked playing, at the track times the playlist volume', () => {
    expect(audioMix({ ...base, playlists: [inn], sounds: [], listener: undefined })).toEqual([
      { key: 'music:inn:lute', src: 'lute.ogg', volume: 0.4, loop: false, playlist: 'inn', track: 'lute' },
    ]);
  });

  it('plays ambient sounds by how near the listener is, and none without one', () => {
    expect(audioMix({ ...base, playlists: [], sounds: [brook], listener: [100, 0] })).toEqual([
      { key: 'sound:brook', src: 'brook.ogg', volume: 0.5, loop: true },
    ]);
    expect(audioMix({ ...base, playlists: [], sounds: [brook], listener: [300, 0] })).toEqual([]);
    expect(audioMix({ ...base, playlists: [], sounds: [brook], listener: undefined })).toEqual([]);
  });

  it('leaves out sounds on another level', () => {
    const upstairs = { ...brook, level: 'loft' };
    expect(audioMix({ ...base, level: 'ground', playlists: [], sounds: [upstairs], listener: [0, 0] })).toEqual([]);
  });
});
