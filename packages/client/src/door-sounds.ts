import { type Chunk, doorSoundOf, doorSwings, type DoorSwing, type Point, soundVolume, type Wall } from '@vtt/shared';

// Doors make a sound when they swing or their lock turns, heard from the
// door's middle like any ambient sound: fading with distance and muffled by
// walls in between. The first look at a chunk plays nothing.

/** How far a door is heard, in feet. */
const EARSHOT = 100;
const LOUDNESS = 0.8;

export interface DoorCue {
  /** A built-in sound (wood, stone, iron, gate) or an audio file. */
  sound: string;
  swing: DoorSwing;
  volume: number;
}

export interface Hearer {
  listener: () => Point | undefined;
  gridSize: () => number;
  walls: () => readonly Wall[];
}

export class DoorSounds {
  private seen = new Map<string, Chunk>();

  constructor(
    private ears: Hearer,
    private play: (cue: DoorCue) => void,
  ) {}

  /** A chunk arrived: play what its doors did since the last time. */
  chunk(key: string, chunk: Chunk): void {
    const swings = doorSwings(this.seen.get(key), chunk);
    this.seen.set(key, chunk);
    const at = this.ears.listener();
    if (!at) return;
    for (const { wall, swing } of swings) {
      const sound = doorSoundOf(wall);
      const volume = sound ? this.volumeAt(wall, at) : 0;
      if (sound && volume > 0) this.play({ sound, swing, volume });
    }
  }

  /** Drops chunks no longer in view, so seeing them again is a first look. */
  forget(inView: readonly string[]): void {
    const keep = new Set(inView);
    for (const key of this.seen.keys()) if (!keep.has(key)) this.seen.delete(key);
  }

  private volumeAt(wall: Wall, at: Point): number {
    const x = (wall.a[0] + wall.b[0]) / 2;
    const y = (wall.a[1] + wall.b[1]) / 2;
    const others = this.ears.walls().filter((w) => w.id !== wall.id);
    const sound = { id: wall.id, x, y, radius: EARSHOT, src: 'door', volume: LOUDNESS };
    return soundVolume(sound, at, { gridSize: this.ears.gridSize(), wallsBetween: () => others });
  }
}
