import type { Doc } from '@vtt/core';
import type { TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it, vi } from 'vitest';
import { menuFor, registerMenu, type MenuApi, type MenuTarget } from './menus.ts';

function api(gm = true) {
  return {
    isGm: () => gm,
    canEdit: () => gm,
    draw: { create: vi.fn() },
    edits: {
      copy: vi.fn(() => undefined),
      cut: vi.fn(() => undefined),
      paste: vi.fn(),
      duplicate: vi.fn(),
      deleteSelected: vi.fn(),
    },
    sheets: { open: vi.fn() },
    requests: { move: vi.fn(), editMap: vi.fn() },
    tiles: { group: vi.fn(), ungroup: vi.fn(), reorder: vi.fn(), toggleLock: vi.fn() },
    editor: { canEditSelection: () => gm, editSelection: vi.fn(), selectAll: vi.fn(), lightPreset: 'torch' as const },
    targets: { mine: new Set<string>(), toggle: vi.fn() },
    hud: { open: vi.fn(), observing: undefined as string | undefined, observe: vi.fn() },
    journal: { open: vi.fn(), show: vi.fn(), showImage: vi.fn(), rollTable: vi.fn() },
    piles: { open: vi.fn() },
    scenes: { fitGrid: vi.fn() },
  } satisfies MenuApi;
}

const on = (...docs: Doc[]): MenuTarget => ({
  mode: 'walls',
  at: [10, 20],
  docs: docs.map((doc) => ({ ref: { coll: 's/walls', id: doc.id }, doc })),
});
const wall = (extra: Record<string, unknown> = {}): Doc => ({ id: 'w', type: 'wall', rev: 1, ...extra });
const labels = (target: MenuTarget, a: MenuApi) => menuFor(target, a).map((i) => i.label);
const pick = (target: MenuTarget, a: MenuApi, label: string) => menuFor(target, a).find((i) => i.label === label)!;

describe('context menus', () => {
  it('a wall offers the other kinds, then copy, cut, duplicate and delete', () => {
    expect(labels(on(wall()), api())).toEqual([
      'Make it a door',
      'Make it a window',
      'Copy',
      'Cut',
      'Duplicate',
      'Delete',
    ]);
  });

  it('doors open, close, lock and unlock', () => {
    const a = api();
    pick(on(wall({ door: 'closed' })), a, 'Open').run();
    expect(a.editor.editSelection).toHaveBeenCalledWith({ door: 'open' });
    pick(on(wall({ door: 'locked' })), a, 'Unlock').run();
    expect(a.editor.editSelection).toHaveBeenLastCalledWith({ door: 'closed' });
    expect(labels(on(wall({ door: 'open' })), a)).toContain('Close');
  });

  it('runs the shared commands', () => {
    const a = api();
    pick(on(wall()), a, 'Delete').run();
    pick(on(wall()), a, 'Duplicate').run();
    pick(on(wall()), a, 'Copy').run();
    pick(on(wall()), a, 'Cut').run();
    expect(a.edits.deleteSelected).toHaveBeenCalled();
    expect(a.edits.duplicate).toHaveBeenCalled();
    expect(a.edits.copy).toHaveBeenCalled();
    expect(a.edits.cut).toHaveBeenCalled();
    expect(pick(on(wall()), a, 'Delete').danger).toBe(true);
  });

  it('lights flicker or hold steady, and turn to darkness and back', () => {
    const a = api();
    const light: Doc = { id: 'l', type: 'light', rev: 1, animation: 'flicker', darkness: true };
    pick(on(light), a, 'Hold steady').run();
    pick(on(light), a, 'Make it light').run();
    expect(a.editor.editSelection.mock.calls).toEqual([[{ animation: null }], [{ darkness: null }]]);
    expect(labels(on({ ...light, animation: undefined, darkness: undefined }), a)).toContain('Flicker');
  });

  it('a token opens its sheet and the GM hides or reveals it', () => {
    const a = api();
    const target: MenuTarget = {
      ...on({ id: 'k', type: 'token', rev: 1 }),
      mode: 'tokens',
      token: { id: 'k', name: 'Kara' } as TokenView,
    };
    pick(target, a, 'Edit sheet').run();
    expect(a.sheets.open).toHaveBeenCalledWith({ kind: 'token', id: 'k' }, true);
    pick(target, a, 'Hide from players').run();
    expect(a.editor.editSelection).toHaveBeenCalledWith({ hidden: true }, 'hide');
    expect(labels(target, api(false))).toEqual(['Open sheet', 'Target']);
  });

  it('a pile opens its window instead of a sheet, and the GM makes a token a pile or a merchant', () => {
    const a = api();
    const pile: MenuTarget = {
      ...on({ id: 'p', type: 'token', rev: 1 }),
      mode: 'tokens',
      token: { id: 'p', name: 'Chest', pile: { kind: 'loot' } } as TokenView,
    };
    expect(labels(pile, api(false))).toEqual(['Open Chest', 'Target']);
    pick(pile, a, 'Lock it').run();
    expect(a.editor.editSelection).toHaveBeenCalledWith({ pile: { kind: 'loot', locked: true } }, 'lock');
    pick(pile, a, 'Make it a merchant').run();
    expect(a.editor.editSelection).toHaveBeenCalledWith({ pile: { kind: 'merchant' } }, 'merchant');
    pick(pile, a, 'Stop being a pile').run();
    expect(a.editor.editSelection).toHaveBeenCalledWith({ pile: null }, 'not a pile');
    pick(pile, a, 'Open Chest').run();
    expect(a.piles.open).toHaveBeenCalledWith('p');
    const kara: MenuTarget = { ...pile, token: { id: 'k', name: 'Kara' } as TokenView };
    expect(labels(kara, a)).toEqual(expect.arrayContaining(['Make it a pile of loot', 'Make it a merchant']));
    expect(labels(kara, api(false))).not.toContain('Make it a merchant');
  });

  it("an object's inspect and uses come first, in place of a pile's own Open entry", () => {
    const uses = [
      { label: 'Inspect', run: vi.fn() },
      { label: 'Open', run: vi.fn() },
    ];
    const ground: MenuTarget = { mode: 'tokens', at: [0, 0], docs: [], uses };
    expect(labels(ground, api(false))).toEqual(['Inspect', 'Open', 'Select all']);
    const pile: MenuTarget = {
      ...on({ id: 'p', type: 'token', rev: 1 }),
      mode: 'tokens',
      token: { id: 'p', name: 'Chest', pile: { kind: 'loot' } } as TokenView,
      uses,
    };
    expect(labels(pile, api(false))).toEqual(['Inspect', 'Open', 'Target']);
  });

  it('the GM shows a token’s art or a picture tile to the players', () => {
    const a = api();
    const token: MenuTarget = {
      ...on({ id: 'k', type: 'token', rev: 1 }),
      mode: 'tokens',
      token: { id: 'k', name: 'Kara', img: '/assets/kara.png' } as TokenView,
    };
    pick(token, a, 'Show art to players').run();
    expect(a.journal.showImage).toHaveBeenCalledWith('/assets/kara.png', 'Kara');
    expect(labels(token, api(false))).not.toContain('Show art to players');
    const tile = { ...on({ id: 't', type: 'tile', rev: 1, kind: 'image', src: '/assets/map.png' }), mode: 'tiles' };
    pick(tile as MenuTarget, a, 'Show to players').run();
    expect(a.journal.showImage).toHaveBeenCalledWith('/assets/map.png');
  });

  it('a token opens its HUD where the menu was', () => {
    const a = api(false);
    const target: MenuTarget = {
      ...on({ id: 'k', type: 'token', rev: 1 }),
      mode: 'tokens',
      token: { id: 'k' } as TokenView,
      screen: [300, 200],
    };
    pick(target, a, 'Token HUD').run();
    expect(a.hud.open).toHaveBeenCalledWith('k', [300, 200]);
  });

  it('the GM sees through a creature’s eyes from its menu, and stops', () => {
    const a = api();
    const target: MenuTarget = {
      ...on({ id: 'k', type: 'token', rev: 1 }),
      mode: 'tokens',
      token: { id: 'k' } as TokenView,
    };
    pick(target, a, 'See through its eyes').run();
    expect(a.hud.observe).toHaveBeenCalledWith('k');
    a.hud.observing = 'k';
    pick(target, a, 'Stop seeing through its eyes').run();
    expect(a.hud.observe).toHaveBeenCalledWith(undefined);
    expect(labels(target, api(false))).not.toContain('See through its eyes');
  });

  it('a token is targeted from its menu, and let go again', () => {
    const a = api(false);
    const target: MenuTarget = {
      ...on({ id: 'k', type: 'token', rev: 1 }),
      mode: 'tokens',
      token: { id: 'k' } as TokenView,
    };
    pick(target, a, 'Target').run();
    expect(a.targets.toggle).toHaveBeenCalledWith('k');
    a.targets.mine.add('k');
    expect(labels(target, a)).toContain('Stop targeting');
  });

  it('a creature you don’t control is targeted from the ground menu', () => {
    const a = api(false);
    const kara = { id: 'k', name: 'Kara' } as TokenView;
    const ground: MenuTarget = {
      ...on(),
      mode: 'tokens',
      under: { id: 'gob', name: 'Goblin' } as TokenView,
      token: kara,
    };
    pick(ground, a, 'Target').run();
    expect(a.targets.toggle).toHaveBeenCalledWith('gob');
    expect(labels({ ...ground, under: undefined }, a)).not.toContain('Target');
  });

  it('the ground pastes, places a light, walks the selected token and selects all', () => {
    const a = api();
    expect(labels(on(), a)).toEqual(['Paste here', 'Select all']);
    pick({ ...on(), mode: 'lights' }, a, 'Place torch here').run();
    expect(a.requests.editMap).toHaveBeenCalledWith({
      op: 'addLight',
      light: expect.objectContaining({ x: 10, y: 20, bright: 20 }) as unknown,
    });
    const kara = { id: 'k', name: 'Kara' } as TokenView;
    pick({ ...on(), mode: 'tokens', token: kara }, api(false), 'Move Kara here').run();
    pick(on(), a, 'Paste here').run();
    pick(on(), a, 'Select all').run();
    expect(a.edits.paste).toHaveBeenCalled();
    expect(a.editor.selectAll).toHaveBeenCalled();
  });

  it('takes entries other code registers, and lets them go', () => {
    const off = registerMenu('wall', () => [{ label: 'Measure', run: () => undefined }]);
    expect(labels(on(wall()), api(false))).toEqual(['Make it a door', 'Make it a window', 'Measure']);
    off();
    expect(labels(on(wall()), api(false))).not.toContain('Measure');
  });

  describe('tiles', () => {
    const tile = (id: string, extra: Record<string, unknown> = {}): Doc => ({
      id,
      type: 'tile',
      rev: 1,
      kind: 'rect',
      ...extra,
    });
    const onTiles = (...docs: Doc[]): MenuTarget => ({
      mode: 'tiles',
      at: [0, 0],
      docs: docs.map((doc) => ({ ref: { coll: 's/tiles', id: doc.id }, doc })),
    });

    it('a tile groups, orders, locks and turns into ground', () => {
      expect(labels(onTiles(tile('a')), api()).slice(0, 7)).toEqual([
        'Group',
        'Bring to front',
        'Bring forward',
        'Send backward',
        'Send to back',
        'Lock',
        'Make it ground',
      ]);
    });

    it('a map picture named with its size in squares sets the grid to fit it', () => {
      const a = api();
      const map = tile('m', { kind: 'image', src: '/assets/maps/Tavern_30x20.webp', w: 4200, h: 2800 });
      pick(onTiles(map), a, 'Match the grid to this map').run();
      expect(a.scenes.fitGrid).toHaveBeenCalledWith(140);
      expect(labels(onTiles(tile('p', { kind: 'image', src: '/assets/barrel.png', w: 100, h: 100 })), a)).not.toContain(
        'Match the grid to this map',
      );
    });

    it('a group ungroups; locked ground unlocks and becomes an object', () => {
      const a = api();
      expect(labels(onTiles({ id: 'g', type: 'tile', rev: 1, kind: 'group' }), a)).toContain('Ungroup');
      pick(onTiles(tile('a', { locked: true, background: true })), a, 'Unlock').run();
      expect(a.tiles.toggleLock).toHaveBeenCalled();
      pick(onTiles(tile('a', { background: true })), a, 'Make it an object').run();
      expect(a.editor.editSelection).toHaveBeenCalledWith({ background: null });
      pick(onTiles(tile('a')), a, 'Bring forward').run();
      expect(a.tiles.reorder).toHaveBeenCalledWith('forward');
    });
  });

  it("opens a note's journal entry, and lets the GM show it to the players", () => {
    const a = api();
    const note: Doc = { id: 'n', type: 'note', rev: 1, x: 0, y: 0, entry: 'lore', page: 'p1' };
    pick({ ...on(note), mode: 'notes' }, a, 'Open journal entry').run();
    expect(a.journal.open).toHaveBeenCalledWith('lore', 'p1');
    pick({ ...on(note), mode: 'notes' }, a, 'Show to players').run();
    expect(a.journal.show).toHaveBeenCalledWith('lore', 'p1');
    expect(labels({ ...on(note), mode: 'notes' }, api(false))).toEqual(['Open journal entry']);
  });

  it("rolls a note's roll table, into chat or (the GM's) to the GM alone", () => {
    const a = api();
    const note: Doc = { id: 'n', type: 'note', rev: 1, x: 0, y: 0, table: 'encounters' };
    pick({ ...on(note), mode: 'notes' }, a, 'Roll on the table').run();
    expect(a.journal.rollTable).toHaveBeenCalledWith('encounters');
    pick({ ...on(note), mode: 'notes' }, a, 'Roll for the GM alone').run();
    expect(a.journal.rollTable).toHaveBeenCalledWith('encounters', true);
    expect(labels({ ...on(note), mode: 'notes' }, api(false))).toEqual(['Roll on the table']);
  });

  it('turns regions on and off, and hides map things from players', () => {
    const a = api();
    const region: Doc = { id: 'r', type: 'region', rev: 1, points: [], behaviors: [] };
    pick(on(region), a, 'Turn off').run();
    expect(a.editor.editSelection).toHaveBeenCalledWith({ disabled: true });
    pick(on(region), a, 'Hide from players').run();
    expect(a.editor.editSelection).toHaveBeenLastCalledWith({ hidden: true }, 'hide');
    expect(labels(on({ ...region, disabled: true, hidden: true }), a)).toEqual(
      expect.arrayContaining(['Turn on', 'Reveal to players']),
    );
  });

  it('puts a note down on the ground in the notes mode', () => {
    const a = api();
    pick({ mode: 'notes', at: [100, 200], docs: [] }, a, 'Put a note here').run();
    expect(a.draw.create).toHaveBeenCalledWith({ mode: 'notes', data: { x: 100, y: 200 } });
  });

  it('gives a player copy, cut and delete on their own drawings, and paste in the drawings mode', () => {
    const base = api(false);
    const a = { ...base, editor: { ...base.editor, canEditSelection: () => true } };
    const mine: Doc = { id: 'd', type: 'drawing', rev: 1, author: 'ana' };
    expect(labels({ ...on(mine), mode: 'drawings' }, a)).toEqual(['Copy', 'Cut', 'Duplicate', 'Delete']);
    expect(labels({ mode: 'drawings', at: [0, 0], docs: [] }, a)).toContain('Paste here');
  });
});

describe('a map picture’s grid', () => {
  it('is read from the squares in its name', async () => {
    const { gridOfPicture } = await import('./menus.ts');
    expect(gridOfPicture('/a/Tavern_30x20.webp', 4200, 2800)).toBe(140);
    expect(gridOfPicture('/a/cave [24x18] night.jpg', 2400, 1800)).toBe(100);
    // The squares must fit both ways, else it's not a size in squares (a 1920x1080 picture).
    expect(gridOfPicture('/a/forest_1920x1080.jpg', 1920, 1080)).toBeUndefined();
    expect(gridOfPicture('/a/forest_30x20.jpg', 3000, 1000)).toBeUndefined();
    expect(gridOfPicture('/a/barrel.png', 100, 100)).toBeUndefined();
  });
});
