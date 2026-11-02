import { describe, expect, it } from 'vitest';
import { blockNativeMenu, keepsNativeMenu, type MenuEvent } from './native-menu.ts';

/** A stand-in element: `closest` finds a text field above it when `inField` is set. */
const el = (inField: boolean, editable = false) => ({
  isContentEditable: editable,
  closest: (selector: string) => (inField && selector.includes('textarea') ? {} : null),
});

describe('keepsNativeMenu', () => {
  it('keeps the browser menu in text fields, for spelling and paste', () => {
    expect(keepsNativeMenu(el(true))).toBe(true);
    expect(keepsNativeMenu(el(false, true))).toBe(true);
  });

  it('drops it everywhere else: the map, our menus, panels', () => {
    expect(keepsNativeMenu(el(false))).toBe(false);
    expect(keepsNativeMenu(null)).toBe(false);
    expect(keepsNativeMenu({})).toBe(false);
  });
});

describe('blockNativeMenu', () => {
  const fakeDoc = () => {
    const handlers = new Map<string, (e: MenuEvent) => void>();
    return {
      handlers,
      addEventListener: (type: string, fn: (e: MenuEvent) => void) => {
        handlers.set(type, fn);
      },
      removeEventListener: (type: string) => {
        handlers.delete(type);
      },
    };
  };
  const rightClick = (target: unknown) => {
    const e = { target, prevented: false, preventDefault: () => (e.prevented = true) };
    return e;
  };

  it('prevents the browser menu outside text fields until stopped', () => {
    const doc = fakeDoc();
    const stop = blockNativeMenu(doc);
    const onMap = rightClick(el(false));
    const inField = rightClick(el(true));
    doc.handlers.get('contextmenu')!(onMap);
    doc.handlers.get('contextmenu')!(inField);
    expect(onMap.prevented).toBe(true);
    expect(inField.prevented).toBe(false);
    stop();
    expect(doc.handlers.has('contextmenu')).toBe(false);
  });
});
