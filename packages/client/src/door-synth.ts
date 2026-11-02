import { DOOR_SOUNDS } from '@vtt/shared';
import { assetUrl } from './assets.ts';
import type { DoorCue } from './door-sounds.ts';

// Door sounds drawn up with Web Audio, so no recordings ship with the game:
// a creak as a door swings, a thump and a latch when it shuts, a click for a
// lock. Stone grinds, iron and gates ring. A door with its own file plays that.

type Material = (typeof DOOR_SOUNDS)[number];

interface Voice {
  ctx: AudioContext;
  out: AudioNode;
  t: number;
}

const MATERIALS: Record<Material, { creak: number; body: number; ring?: number }> = {
  wood: { creak: 170, body: 260 },
  stone: { creak: 0, body: 140 },
  iron: { creak: 340, body: 420, ring: 620 },
  gate: { creak: 420, body: 520, ring: 900 },
};

/** Loudness, start and length in seconds. */
type Timing = [number, number, number];

let audio: AudioContext | undefined;

function context(): AudioContext | undefined {
  if (typeof AudioContext === 'undefined') return undefined;
  audio ??= new AudioContext();
  return audio;
}

function noise(ctx: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  return src;
}

/** A gain that rises fast and dies away over `length` seconds, starting `delay` in. */
function envelope(v: Voice, peak: number, delay: number, length: number): GainNode {
  const g = v.ctx.createGain();
  const start = v.t + delay;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + length);
  g.connect(v.out);
  return g;
}

/** A burst of filtered noise: a thump (low), a latch or a grind. */
function burst(v: Voice, [freq, type]: [number, BiquadFilterType], [peak, delay, length]: Timing): void {
  const src = noise(v.ctx, length + 0.05);
  const filter = v.ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  src.connect(filter).connect(envelope(v, peak, delay, length));
  src.start(v.t + delay);
}

/** A tone gliding from `from` to `to` Hz: the creak of hinges, or the ring of iron. */
function tone(v: Voice, [from, to]: [number, number], [peak, delay, length]: Timing, wave: OscillatorType): void {
  const osc = v.ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, v.t + delay);
  osc.frequency.linearRampToValueAtTime(to, v.t + delay + length);
  osc.connect(envelope(v, peak, delay, length));
  osc.start(v.t + delay);
  osc.stop(v.t + delay + length + 0.05);
}

function swing(v: Voice, m: (typeof MATERIALS)[Material], closing: boolean): void {
  if (m.creak) tone(v, closing ? [m.creak * 0.7, m.creak] : [m.creak, m.creak * 0.65], [0.08, 0, 0.55], 'sawtooth');
  else burst(v, [m.body * 2, 'lowpass'], [0.5, 0, 0.7]);
  if (!closing) return;
  burst(v, [m.body, 'lowpass'], [0.9, 0.5, 0.18]);
  burst(v, [3000, 'highpass'], [0.3, 0.55, 0.03]);
  if (m.ring) tone(v, [m.ring, m.ring], [0.15, 0.5, 0.6], 'sine');
}

function lock(v: Voice): void {
  burst(v, [2500, 'bandpass'], [0.5, 0, 0.03]);
  burst(v, [1800, 'bandpass'], [0.4, 0.12, 0.04]);
}

function playFile(src: string, volume: number): void {
  const a = new Audio(assetUrl(src));
  a.volume = Math.min(1, volume);
  a.play().catch(() => undefined);
}

/** Plays a door's sound at the cue's volume. */
export function playDoor(cue: DoorCue): void {
  if (!(DOOR_SOUNDS as readonly string[]).includes(cue.sound)) return playFile(cue.sound, cue.volume);
  const ctx = context();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = cue.volume;
  out.connect(ctx.destination);
  const v: Voice = { ctx, out, t: ctx.currentTime + 0.01 };
  if (cue.swing === 'lock' || cue.swing === 'unlock') lock(v);
  else swing(v, MATERIALS[cue.sound as Material], cue.swing === 'close');
}
