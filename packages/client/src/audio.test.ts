import type { Doc } from '@vtt/core';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundScape } from './audio.ts';
import type { Session } from './session.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

// The sound scape plays what the mix says, through <audio> elements.

class FakeAudio {
  static readonly made: FakeAudio[] = [];
  loop = false;
  volume = 1;
  paused = false;
  private listeners: (() => void)[] = [];
  constructor(readonly src: string) {
    FakeAudio.made.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener(_e: string, fn: () => void) {
    this.listeners.push(fn);
  }
  end() {
    for (const fn of this.listeners) fn();
  }
}

let session: Session;
let ws: FakeWebSocket;
let scape: SoundScape | undefined;

beforeEach(() => {
  FakeAudio.made.length = 0;
  vi.stubGlobal('Audio', FakeAudio);
  ({ session, ws } = openSession());
});

afterEach(() => {
  scape?.destroy();
  closeSession(session);
  vi.unstubAllGlobals();
});

const inn: Doc = {
  id: 'inn',
  type: 'playlist',
  rev: 1,
  name: 'Inn',
  mode: 'sequence',
  tracks: [
    { id: 'lute', name: 'Lute', src: '/assets/lute.ogg', playing: true },
    { id: 'harp', name: 'Harp', src: '/assets/harp.ogg' },
  ],
};
const brook: Doc = {
  id: 'brook',
  type: 'sound',
  rev: 1,
  x: 50,
  y: 50,
  radius: 20,
  src: '/assets/brook.ogg',
  volume: 1,
};

function join(gm: boolean): void {
  const base = welcome([token('hero')]) as Extract<ServerMessage, { t: 'welcome' }>;
  const you = gm ? { id: 'gm', name: 'GM', role: 'gm' as const, color: '#fc0' } : base.you;
  ws.receive({ ...base, you, docs: { playlists: [inn], 'main/sounds': [brook] } });
  scape = new SoundScape(session);
}

describe('the sound scape', () => {
  it('plays the music and the sounds near your token', () => {
    join(false);
    expect(FakeAudio.made.map((a) => a.src).sort((a, b) => a.localeCompare(b))).toEqual([
      '/assets/brook.ogg',
      '/assets/lute.ogg',
    ]);
    expect(FakeAudio.made.find((a) => a.src.includes('brook'))).toMatchObject({ loop: true, volume: 1 });
  });

  it('stops what is no longer playing', () => {
    join(false);
    ws.receive({ t: 'docs', changes: [{ coll: 'playlists', id: 'inn', doc: undefined }] });
    expect(FakeAudio.made.find((a) => a.src.includes('lute'))?.paused).toBe(true);
  });

  it("moves the GM's playlist on to the next track when one ends", () => {
    join(true);
    FakeAudio.made.find((a) => a.src.includes('lute'))!.end();
    expect(ws.sent.at(-1)).toMatchObject({
      t: 'ops',
      ops: [{ id: 'inn', patch: { tracks: [{ id: 'lute' }, { id: 'harp', playing: true }] } }],
    });
  });
});
