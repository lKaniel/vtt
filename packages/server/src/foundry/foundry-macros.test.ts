import { describe, expect, it } from 'vitest';
import { foundryMacros } from './foundry-macros.ts';

const media = (path: string) => (path === 'icons/hail.webp' ? '/assets/foundry/hail.webp' : undefined);
const folderOf = (id: string | null | undefined) => (id === 'f1' ? 'Greetings' : undefined);

describe('Foundry macros', () => {
  it('bring chat macros with their lines, picture and folder', () => {
    const out = foundryMacros(
      [{ _id: 'a', name: 'Hail!', type: 'chat', command: 'Well met\n/r 1d20', img: 'icons/hail.webp', folder: 'f1' }],
      media,
      folderOf,
    );
    expect(out.macros).toEqual([
      {
        id: 'hail',
        name: 'Hail!',
        kind: 'chat',
        command: 'Well met\n/r 1d20',
        img: '/assets/foundry/hail.webp',
        folder: 'Greetings',
      },
    ]);
    expect(out.skipped).toEqual([]);
  });

  it('leave script macros behind, saying which only roll an item the hotbar already has', () => {
    const out = foundryMacros(
      [
        { name: 'Longsword', type: 'script', command: 'dnd5e.documents.macro.rollItem("Longsword")' },
        { name: 'Torch', type: 'script', command: 'game.macros.getName("x")' },
        { name: 'Bad' },
      ],
      media,
    );
    expect(out.macros).toEqual([]);
    expect(out.skipped).toEqual([
      {
        what: 'Macros that roll an item from the hotbar (our hotbar does that already)',
        count: 1,
        examples: ['Longsword'],
      },
      { what: 'Script macros (their code is Foundry’s own)', count: 1, examples: ['Torch'] },
    ]);
  });
});
