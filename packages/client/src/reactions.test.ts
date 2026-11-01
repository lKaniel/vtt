import type { ReactionOffer } from '@vtt/system-dnd5e';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withOffer } from './reactions.ts';
import { Session } from './session.ts';

const offer = (id: string): ReactionOffer => ({
  id,
  reactor: 'goblin',
  target: 'bo',
  kind: 'opportunity',
  choices: ['Scimitar'],
});

describe('reaction offers', () => {
  it('keeps offers until they are gone', () => {
    const one = withOffer([], { t: 'reactionOffer', offer: offer('a') });
    const two = withOffer(one, { t: 'reactionOffer', offer: offer('b') });
    expect(two.map((o) => o.id)).toEqual(['a', 'b']);
    expect(withOffer(two, { t: 'reactionGone', id: 'a' }).map((o) => o.id)).toEqual(['b']);
  });

  it('ignores an offer it already has', () => {
    const one = withOffer([], { t: 'reactionOffer', offer: offer('a') });
    expect(withOffer(one, { t: 'reactionOffer', offer: offer('a') })).toHaveLength(1);
  });
});

describe('Session reactions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('holds offers from the server and answers them', () => {
    const sent: unknown[] = [];
    let socket: { onmessage?: (e: { data: string }) => void } = {};
    vi.stubGlobal('location', { protocol: 'http:', host: 'table:3000' });
    vi.stubGlobal(
      'WebSocket',
      class {
        static readonly OPEN = 1;
        readyState = 1;
        onmessage?: (e: { data: string }) => void;
        constructor() {
          // eslint-disable-next-line @typescript-eslint/no-this-alias -- the test talks through the socket the session opened
          socket = this;
        }
        send(text: string) {
          sent.push(JSON.parse(text));
        }
        close() {
          this.readyState = 3;
        }
      },
    );
    const session = new Session('ana');
    session.connect();
    socket.onmessage?.({ data: JSON.stringify({ t: 'reactionOffer', offer: offer('a') }) });
    expect(session.reactions).toHaveLength(1);
    session.takeReaction('a', 'Scimitar');
    expect(sent.at(-1)).toEqual({ t: 'react', offer: 'a', choice: 'Scimitar' });
    session.takeReaction('a');
    expect(sent.at(-1)).toEqual({ t: 'react', offer: 'a' });
    socket.onmessage?.({ data: JSON.stringify({ t: 'reactionGone', id: 'a' }) });
    expect(session.reactions).toEqual([]);
    session.close();
  });
});
