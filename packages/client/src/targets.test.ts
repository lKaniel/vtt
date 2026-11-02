import { describe, expect, it } from 'vitest';
import { Targets } from './targets.ts';

const ana = { id: 'ana', name: 'Ana', color: '#f00' };

function make() {
  const sent: unknown[] = [];
  let changes = 0;
  const targets = new Targets({
    send: (msg) => sent.push(msg),
    changed: () => changes++,
    you: () => ana,
  });
  return { targets, sent, changes: () => changes };
}

describe('targets', () => {
  it('toggle a token in and out of yours, and tell the table', () => {
    const { targets, sent, changes } = make();
    targets.toggle('goblin');
    targets.toggle('orc');
    expect([...targets.mine]).toEqual(['goblin', 'orc']);
    targets.toggle('goblin');
    expect(sent).toEqual([
      { t: 'target', tokens: ['goblin'] },
      { t: 'target', tokens: ['goblin', 'orc'] },
      { t: 'target', tokens: ['orc'] },
    ]);
    expect(changes()).toBe(3);
  });

  it('name your one target, if you have just one', () => {
    const { targets } = make();
    expect(targets.only()).toBeUndefined();
    targets.toggle('goblin');
    expect(targets.only()).toBe('goblin');
    targets.toggle('orc');
    expect(targets.only()).toBeUndefined();
  });

  it('clear, only when there is something to clear', () => {
    const { targets, sent } = make();
    expect(targets.clear()).toBe(false);
    targets.toggle('goblin');
    expect(targets.clear()).toBe(true);
    expect(sent.at(-1)).toEqual({ t: 'target', tokens: [] });
    expect(targets.mine.size).toBe(0);
  });

  it('list who targets a token, you first, in their colours', () => {
    const { targets } = make();
    targets.receive({ t: 'targets', player: 'bo', name: 'Bo', color: '#0f0', tokens: ['goblin'] });
    targets.toggle('goblin');
    expect(targets.on('goblin')).toEqual([
      { player: 'ana', name: 'Ana', color: '#f00' },
      { player: 'bo', name: 'Bo', color: '#0f0' },
    ]);
    targets.receive({ t: 'targets', player: 'bo', name: 'Bo', color: '#0f0', tokens: [] });
    expect(targets.on('goblin')).toHaveLength(1);
    expect(targets.any()).toBe(true);
  });

  it('forget a token that is gone, and everything on starting over', () => {
    const { targets, sent } = make();
    targets.toggle('goblin');
    targets.receive({ t: 'targets', player: 'bo', name: 'Bo', color: '#0f0', tokens: ['goblin'] });
    targets.forget('goblin');
    expect(targets.mine.size).toBe(0);
    expect(sent).toHaveLength(1);
    targets.reset(() => false);
    expect(targets.any()).toBe(false);
    expect(sent).toHaveLength(1);
  });
});
