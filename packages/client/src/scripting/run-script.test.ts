import { describe, expect, it } from 'vitest';
import { runScript } from './run-script.ts';

describe('running a script', () => {
  it('runs the code with the names it is given, and may await', async () => {
    const said: string[] = [];
    const vtt = { chat: (t: string) => said.push(t) };
    const out = await runScript('await null; vtt.chat("hi " + token); return 7;', { vtt, token: 'bram' });
    expect(said).toEqual(['hi bram']);
    expect(out).toBe(7);
  });

  it('rejects with the script’s own error', async () => {
    await expect(runScript('throw new Error("nope")', {})).rejects.toThrow('nope');
    await expect(runScript('this is not code', {})).rejects.toThrow(SyntaxError);
  });
});
