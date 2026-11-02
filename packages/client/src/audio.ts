import { nextTrack, onLevel, type Playlist, type Point, type Wall } from '@vtt/shared';
import { assetUrl } from './assets.ts';
import { audioMix, type Channel } from './audio-mix.ts';
import { DoorSounds } from './door-sounds.ts';
import { playDoor } from './door-synth.ts';
import type { Session } from './session.ts';

// Plays what audio-mix.ts says this client should hear, with one <audio>
// per channel. When a track that doesn't repeat ends, the GM's client starts
// the next one (in order or shuffled), so every client follows the GM's.

export class SoundScape {
  private playing = new Map<string, HTMLAudioElement>();
  private off: (() => void)[] = [];
  private doors: DoorSounds;

  constructor(private session: Session) {
    const ears = {
      listener: () => this.listener(),
      gridSize: () => session.world?.gridSize ?? 100,
      walls: () => this.walls(),
    };
    this.doors = new DoorSounds(ears, playDoor);
    const update = () => this.update();
    this.off.push(session.on('change', update), session.on('editor', update), session.on('token', update));
    this.off.push(session.on('chunk', (key) => this.doorsIn(key)));
    this.off.push(session.on('sound', (src, volume) => playOnce(src, volume)));
    this.update();
  }

  /** A chunk arrived: its doors may have swung. */
  private doorsIn(key: string): void {
    const chunk = this.session.chunks.get(key);
    this.doors.forget([...this.session.chunks.keys()]);
    if (chunk) this.doors.chunk(key, chunk);
  }

  destroy(): void {
    for (const off of this.off) off();
    for (const audio of this.playing.values()) audio.pause();
    this.playing.clear();
  }

  /** Where you hear from: the token you act with (or your first), or the GM's view. */
  private listener(): Point | undefined {
    const s = this.session;
    if (s.isGm()) return s.viewCentre();
    const acting = s.selected ? s.tokens.get(s.selected) : undefined;
    const t = acting ?? [...s.tokens.values()].find((x) => s.canControl(x));
    return t && [t.x, t.y];
  }

  private walls(): Wall[] {
    const level = this.session.level;
    return [...this.session.chunks.values()].flatMap((c) => c.walls.filter((w) => onLevel(w, level)));
  }

  private update(): void {
    const s = this.session;
    const walls = this.walls();
    const mix = audioMix({
      playlists: s.docs.all('playlists'),
      sounds: s.docs.all(`${s.scene}/sounds`),
      listener: this.listener(),
      gridSize: s.world?.gridSize ?? 100,
      darkness: s.world?.darkness ?? 0,
      level: s.level,
      wallsBetween: () => walls,
    });
    const wanted = new Set(mix.map((c) => c.key));
    for (const [key, audio] of this.playing)
      if (!wanted.has(key)) {
        audio.pause();
        this.playing.delete(key);
      }
    for (const channel of mix) this.play(channel);
  }

  private play(channel: Channel): void {
    let audio = this.playing.get(channel.key);
    if (!audio) {
      audio = new Audio(assetUrl(channel.src));
      audio.addEventListener('ended', () => this.ended(channel));
      this.playing.set(channel.key, audio);
      // Browsers wait for a first click before they play anything.
      audio.play().catch(() => undefined);
    }
    audio.loop = channel.loop;
    audio.volume = Math.min(1, Math.max(0, channel.volume));
  }

  /** A track ended: the GM's client moves its playlist on. */
  private ended(channel: Channel): void {
    const s = this.session;
    this.playing.delete(channel.key);
    if (!s.isGm() || !channel.playlist || !channel.track) return;
    const doc = s.docs.get('playlists', channel.playlist);
    if (!doc) return;
    const next = nextTrack(doc as unknown as Playlist, channel.track, Math.random);
    if (next) s.playPlaylist(channel.playlist, next);
    else s.stopPlaylist(channel.playlist);
  }
}

/** A sound a trigger plays once, for everyone on the scene. */
function playOnce(src: string, volume: number): void {
  const audio = new Audio(assetUrl(src));
  audio.volume = Math.min(1, Math.max(0, volume));
  audio.play().catch(() => undefined);
}
