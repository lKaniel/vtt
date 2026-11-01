import type { Doc } from '@vtt/core';
import type { TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it, vi } from 'vitest';
import { menuFor, registerMenu, type MenuApi, type MenuTarget } from './menus.ts';

function api(gm = true) {
  return {
    isGm: () => gm,
    canEdit: () => gm,
    copy: vi.fn(() => undefined),
    cut: vi.fn(() => undefined),
    paste: vi.fn(),
    duplicate: vi.fn(),
    deleteSelected: vi.fn(),
    editSelection: vi.fn(),
    selectAll: vi.fn(),
    setSelection: vi.fn(),
    openSheet: vi.fn(),
    move: vi.fn(),
    editMap: vi.fn(),
    group: vi.fn(),
    ungroup: vi.fn(),
    reorder: vi.fn(),
    toggleLock: vi.fn(),
    lightPreset: 'torch' as const,
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
    expect(a.editSelection).toHaveBeenCalledWith({ door: 'open' });
    pick(on(wall({ door: 'locked' })), a, 'Unlock').run();
    expect(a.editSelection).toHaveBeenLastCalledWith({ door: 'closed' });
    expect(labels(on(wall({ door: 'open' })), a)).toContain('Close');
  });

  it('runs the shared commands', () => {
    const a = api();
    pick(on(wall()), a, 'Delete').run();
    pick(on(wall()), a, 'Duplicate').run();
    pick(on(wall()), a, 'Copy').run();
    pick(on(wall()), a, 'Cut').run();
    expect(a.deleteSelected).toHaveBeenCalled();
    expect(a.duplicate).toHaveBeenCalled();
    expect(a.copy).toHaveBeenCalled();
    expect(a.cut).toHaveBeenCalled();
    expect(pick(on(wall()), a, 'Delete').danger).toBe(true);
  });

  it('lights flicker or hold steady, and turn to darkness and back', () => {
    const a = api();
    const light: Doc = { id: 'l', type: 'light', rev: 1, animation: 'flicker', darkness: true };
    pick(on(light), a, 'Hold steady').run();
    pick(on(light), a, 'Make it light').run();
    expect(a.editSelection.mock.calls).toEqual([[{ animation: null }], [{ darkness: null }]]);
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
    expect(a.openSheet).toHaveBeenCalledWith({ kind: 'token', id: 'k' }, true);
    pick(target, a, 'Hide from players').run();
    expect(a.editSelection).toHaveBeenCalledWith({ hidden: true }, 'hide');
    expect(labels(target, api(false))).toEqual(['Open sheet']);
  });

  it('the ground pastes, places a light, walks the selected token and selects all', () => {
    const a = api();
    expect(labels(on(), a)).toEqual(['Paste here', 'Select all']);
    pick({ ...on(), mode: 'lights' }, a, 'Place torch here').run();
    expect(a.editMap).toHaveBeenCalledWith({
      op: 'addLight',
      light: expect.objectContaining({ x: 10, y: 20, bright: 20 }) as unknown,
    });
    const kara = { id: 'k', name: 'Kara' } as TokenView;
    pick({ ...on(), mode: 'tokens', token: kara }, api(false), 'Move Kara here').run();
    pick(on(), a, 'Paste here').run();
    pick(on(), a, 'Select all').run();
    expect(a.paste).toHaveBeenCalled();
    expect(a.selectAll).toHaveBeenCalled();
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

    it('a group ungroups; locked ground unlocks and becomes an object', () => {
      const a = api();
      expect(labels(onTiles({ id: 'g', type: 'tile', rev: 1, kind: 'group' }), a)).toContain('Ungroup');
      pick(onTiles(tile('a', { locked: true, background: true })), a, 'Unlock').run();
      expect(a.toggleLock).toHaveBeenCalled();
      pick(onTiles(tile('a', { background: true })), a, 'Make it an object').run();
      expect(a.editSelection).toHaveBeenCalledWith({ background: null });
      pick(onTiles(tile('a')), a, 'Bring forward').run();
      expect(a.reorder).toHaveBeenCalledWith('forward');
    });
  });
});
