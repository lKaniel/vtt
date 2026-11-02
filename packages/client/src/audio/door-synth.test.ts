import { afterEach, describe, expect, it, vi } from 'vitest';

// Door sounds are drawn up with Web Audio; this fake counts what is made.

const made: string[] = [];
const param = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
});
const node = (kind: string, extra: object = {}) => {
  made.push(kind);
  const n = { connect: (next: unknown) => next, start: vi.fn(), stop: vi.fn(), ...extra };
  return n;
};

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  createGain = () => node('gain', { gain: param() });
  createBiquadFilter = () => node('filter', { type: '', frequency: param() });
  createOscillator = () => node('oscillator', { type: '', frequency: param() });
  createBufferSource = () => node('noise', { buffer: null });
  createBuffer = (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) });
}

const played: string[] = [];
class FakeAudio {
  volume = 1;
  constructor(readonly src: string) {
    played.push(src);
  }
  play = () => Promise.resolve();
}

afterEach(() => {
  made.length = 0;
  played.length = 0;
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function synth() {
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('Audio', FakeAudio);
  return (await import('./door-synth.ts')).playDoor;
}

const count = (kind: string) => made.filter((k) => k === kind).length;

describe('door synth', () => {
  it('creaks a wooden door open, and thumps and latches it shut', async () => {
    const play = await synth();
    play({ sound: 'wood', swing: 'open', volume: 1 });
    expect([count('oscillator'), count('noise')]).toEqual([1, 0]);
    made.length = 0;
    play({ sound: 'wood', swing: 'close', volume: 1 });
    expect([count('oscillator'), count('noise')]).toEqual([1, 2]);
  });

  it('grinds stone, rings iron, and clicks a lock', async () => {
    const play = await synth();
    play({ sound: 'stone', swing: 'open', volume: 1 });
    expect([count('oscillator'), count('noise')]).toEqual([0, 1]);
    made.length = 0;
    play({ sound: 'iron', swing: 'close', volume: 1 });
    expect(count('oscillator')).toBe(2);
    made.length = 0;
    play({ sound: 'gate', swing: 'lock', volume: 1 });
    expect([count('oscillator'), count('noise')]).toEqual([0, 2]);
  });

  it('plays a door that has its own file', async () => {
    const play = await synth();
    play({ sound: 'sounds/portcullis.ogg', swing: 'open', volume: 0.5 });
    expect(played).toEqual(['/assets/sounds/portcullis.ogg']);
    expect(made).toEqual([]);
  });

  it('stays quiet where there is no Web Audio', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const { playDoor } = await import('./door-synth.ts');
    playDoor({ sound: 'wood', swing: 'open', volume: 1 });
    expect(made).toEqual([]);
  });
});
