import type { ClientMessage } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { TileAsks } from './session-asks.ts';

// A tile's question (Monk's dialog buttons): kept until you answer or close it.

function asks() {
  const sent: ClientMessage[] = [];
  const part = new TileAsks({ send: (m) => sent.push(m) });
  return { part, sent };
}

const question = {
  t: 'triggerChoice' as const,
  id: 'choice-1',
  title: 'The well',
  text: 'Climb down?',
  options: ['Yes', 'No'],
};

describe("a tile's question", () => {
  it('is kept when the server asks it, and leaves other messages alone', () => {
    const { part } = asks();
    expect(part.receive({ t: 'paused', paused: true } as never)).toBeUndefined();
    expect(part.receive(question)).toBe(true);
    expect(part.question).toMatchObject({ text: 'Climb down?', options: ['Yes', 'No'] });
  });

  it('sends the answer picked, once, and closes', () => {
    const { part, sent } = asks();
    part.receive(question);
    part.answer(1);
    part.answer(0);
    expect(sent).toEqual([{ t: 'triggerChoice', id: 'choice-1', option: 1 }]);
    expect(part.question).toBeUndefined();
  });

  it('closes without an answer', () => {
    const { part, sent } = asks();
    part.receive(question);
    part.dismiss();
    expect(part.question).toBeUndefined();
    expect(sent).toEqual([]);
  });
});
