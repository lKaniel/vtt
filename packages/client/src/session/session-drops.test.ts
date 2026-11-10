import type { ClientMessage, TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { Drops, type DropHost } from './session-drops.ts';

const hero = {
  id: 'hero',
  name: 'Hero',
  x: 150,
  y: 150,
  size: 1,
  inventory: [{ item: 'dagger', qty: 1 }],
} as TokenView;
const ogre = { id: 'ogre', name: 'Ogre', x: 550, y: 550, size: 1 } as TokenView;

function drops() {
  const sent: ClientMessage[] = [];
  const errors: string[] = [];
  const host = {
    world: { gridSize: 100 },
    tokens: new Map([
      ['hero', hero],
      ['ogre', ogre],
    ]),
    actors: new Map(),
    sheets: {},
    draw: { create: () => undefined },
    requests: { saveActor: () => undefined },
    send: (m: ClientMessage) => sent.push(m),
    showError: (e: string) => errors.push(e),
  } as unknown as DropHost;
  return { drops: new Drops(host, { changed: () => undefined, placeMedia: () => undefined }), sent, errors };
}

describe('Drops', () => {
  it('drops a carried stack on the open ground as a pile, looking the carrier up among the live tokens', () => {
    const { drops: d, sent, errors } = drops();
    d.onMap({ kind: 'carried', from: 'hero', item: 'dagger' }, [900, 900]);
    expect(errors).toEqual([]);
    expect(sent).toEqual([{ t: 'trade', from: 'hero', item: 0 }]);
  });

  it('hands a carried stack to the creature it lands on', () => {
    const { drops: d, sent } = drops();
    d.onMap({ kind: 'carried', from: 'hero', item: 'dagger' }, [560, 540]);
    expect(sent).toEqual([{ t: 'give', from: 'hero', to: 'ogre', item: 'dagger' }]);
  });
});
