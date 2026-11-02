import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { foundryDocs, readFoundryDb } from './foundry-db.ts';

const json = (x: unknown) => JSON.stringify(x);

describe('foundryDocs', () => {
  it('puts embedded documents back into their parents, at every depth', () => {
    const entries = new Map([
      ['!adventures!adv', json({ _id: 'adv', name: 'Lost Mine', scenes: ['s1'], actors: [] })],
      ['!adventures.scenes!adv.s1', json({ _id: 's1', name: 'Cave', tokens: ['t1', 'gone'], walls: [] })],
      ['!adventures.scenes.tokens!adv.s1.t1', json({ _id: 't1', name: 'Goblin' })],
    ]);
    expect(foundryDocs(entries)).toEqual([
      {
        _id: 'adv',
        name: 'Lost Mine',
        scenes: [{ _id: 's1', name: 'Cave', tokens: [{ _id: 't1', name: 'Goblin' }], walls: [] }],
        actors: [],
      },
    ]);
  });

  it('keeps lists of plain ids that are not embedded documents', () => {
    const entries = new Map([['!folders!f', json({ _id: 'f', name: 'NPCs', sorting: ['a', 'b'] })]]);
    expect(foundryDocs(entries)).toEqual([{ _id: 'f', name: 'NPCs', sorting: ['a', 'b'] }]);
  });
});

describe('readFoundryDb', () => {
  it('reads a LevelDB folder (Foundry v11 and later)', async () => {
    const actors = await readFoundryDb(join(import.meta.dirname, 'test', 'leveldb-actors'));
    expect(actors).toHaveLength(300 - 1 + 1);
    expect(actors.find((a) => a._id === 'actor00000000007')).toMatchObject({
      name: 'Goblin 7',
      items: [{ _id: 'item7', name: 'Scimitar' }],
    });
  });

  it('reads a NeDB file (v10 and before), with or without its .db', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'foundry-db-'));
    const lines = [json({ _id: 'a', name: 'Old' }), json({ _id: 'a', name: 'New' }), json({ _id: 'b', name: 'B' })];
    await writeFile(join(dir, 'actors.db'), [...lines, json({ _id: 'b', $$deleted: true }), 'not json'].join('\n'));
    expect(await readFoundryDb(join(dir, 'actors.db'))).toEqual([{ _id: 'a', name: 'New' }]);
    expect(await readFoundryDb(join(dir, 'actors'))).toEqual([{ _id: 'a', name: 'New' }]);
    expect(await readFoundryDb(join(dir, 'nothing'))).toEqual([]);
  });
});
