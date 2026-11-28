import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErrorLog } from './error-log.ts';

async function aFile(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), 'vtt-errors-')), 'errors', 'home.json');
}

describe('a game’s error log on disk', () => {
  it('keeps what was logged for the next time the game loads', async () => {
    const file = await aFile();
    const log = new ErrorLog(file, () => 5);
    log.add({ source: 'server', message: 'boom', where: 'move' });
    await log.flush();
    const again = new ErrorLog(file);
    await again.load();
    expect(again.entries).toEqual([expect.objectContaining({ message: 'boom', where: 'move', at: 5 })]);
  });

  it('starts empty without a file, and empties when cleared', async () => {
    const file = await aFile();
    const log = new ErrorLog(file);
    await log.load();
    expect(log.entries).toEqual([]);
    log.add({ source: 'browser', message: 'x' });
    log.clear();
    await log.flush();
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([]);
  });

  it('tells its listeners each error, and when it was cleared', () => {
    const log = new ErrorLog();
    const heard: unknown[] = [];
    log.listen((entry) => heard.push(entry?.message ?? 'cleared'));
    log.add({ source: 'server', message: 'one' });
    log.clear();
    expect(heard).toEqual(['one', 'cleared']);
  });

  it('can be written at once, for a server about to stop', async () => {
    const file = await aFile();
    const log = new ErrorLog(file);
    log.add({ source: 'server', message: 'last words' });
    log.flushNow();
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([expect.objectContaining({ message: 'last words' })]);
  });
});
