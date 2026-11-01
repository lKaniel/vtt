import type { Rng } from './dice.ts';
import type { Playlist } from './journals.ts';

// Playlists: the GM starts and stops them, every client plays the tracks
// marked playing. In a sequence or shuffle one track plays at a time and the
// GM's client moves on when it ends; together, every track loops at once.

/** Starts the playlist: `track`, or its first (together: every track). */
export function playPatch(p: Playlist, track?: string): Pick<Playlist, 'tracks'> {
  const first = track ?? p.tracks[0]?.id;
  return {
    tracks: p.tracks.map(({ playing: _p, ...t }) =>
      p.mode === 'together' || t.id === first ? { ...t, playing: true } : t,
    ),
  };
}

export function stopPatch(p: Playlist): Pick<Playlist, 'tracks'> {
  return { tracks: p.tracks.map(({ playing: _p, ...t }) => t) };
}

/** The track to play after `ended`: the next one (round to the first), a random other in a shuffle, none together. */
export function nextTrack(p: Playlist, ended: string, rng: Rng): string | undefined {
  if (p.mode === 'together' || !p.tracks.length) return undefined;
  const i = p.tracks.findIndex((t) => t.id === ended);
  if (p.mode === 'sequence') return p.tracks[(i + 1) % p.tracks.length]!.id;
  const others = p.tracks.filter((t) => t.id !== ended);
  if (!others.length) return ended;
  return others[Math.min(others.length - 1, Math.floor(rng() * others.length))]!.id;
}
