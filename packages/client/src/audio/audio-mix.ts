import type { Doc } from '@vtt/core';
import { onLevel, type Point, type Sound, soundVolume, type Track, type Wall } from '@vtt/shared';

// What this client should hear: every playing track of the playlists it was
// sent (those playing), and the scene's ambient sounds, as loud as the
// listener (your token, or the GM's view) is near them, muffled by walls.

export interface Channel {
  key: string;
  src: string;
  /** 0 to 1. */
  volume: number;
  loop: boolean;
  /** For music: which playlist and track, so the GM's client can move on when it ends. */
  playlist?: string;
  track?: string;
}

export interface MixInput {
  playlists: readonly Doc[];
  sounds: readonly Doc[];
  /** Where you hear from; no one to hear with, no ambient sound. */
  listener: Point | undefined;
  gridSize: number;
  darkness: number;
  level: string | undefined;
  wallsBetween: (a: Point, b: Point) => readonly Wall[];
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function music(playlists: readonly Doc[]): Channel[] {
  return playlists.flatMap((p) => {
    const tracks = (p.tracks as Track[] | undefined) ?? [];
    const gain = (p.volume as number | undefined) ?? 1;
    return tracks
      .filter((t) => t.playing)
      .map((t) => ({
        key: `music:${p.id}:${t.id}`,
        src: t.src,
        volume: round((t.volume ?? 1) * gain),
        loop: p.mode === 'together' || !!t.repeat,
        playlist: p.id,
        track: t.id,
      }));
  });
}

function ambient(input: MixInput): Channel[] {
  const at = input.listener;
  if (!at) return [];
  const hearing = { gridSize: input.gridSize, darkness: input.darkness, wallsBetween: input.wallsBetween };
  return input.sounds.flatMap((doc) => {
    const sound = doc as unknown as Sound;
    if (!onLevel(sound, input.level)) return [];
    const volume = round(soundVolume(sound, at, hearing));
    return volume > 0 ? [{ key: `sound:${doc.id}`, src: sound.src, volume, loop: true }] : [];
  });
}

export function audioMix(input: MixInput): Channel[] {
  return [...music(input.playlists), ...ambient(input)];
}
