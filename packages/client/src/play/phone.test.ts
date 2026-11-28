import { describe, expect, it } from 'vitest';
import { isPhoneScreen, phoneTab, usesPhoneLayout } from './phone.ts';

describe('phone layout', () => {
  it('takes a narrow screen for a phone, held upright', () => {
    expect(isPhoneScreen({ width: 390, height: 844, coarse: true })).toBe(true);
    expect(isPhoneScreen({ width: 640, height: 900, coarse: false })).toBe(true);
  });

  it('takes a short touch screen for a phone held sideways, but not a short desktop window', () => {
    expect(isPhoneScreen({ width: 844, height: 390, coarse: true })).toBe(true);
    expect(isPhoneScreen({ width: 844, height: 390, coarse: false })).toBe(false);
  });

  it('leaves tablets and laptops on the table layout', () => {
    expect(isPhoneScreen({ width: 820, height: 1180, coarse: true })).toBe(false);
    expect(isPhoneScreen({ width: 1366, height: 768, coarse: false })).toBe(false);
  });

  it('follows the choice in settings over the screen', () => {
    const phone = { width: 390, height: 844, coarse: true };
    const laptop = { width: 1366, height: 768, coarse: false };
    expect(usesPhoneLayout('auto', phone)).toBe(true);
    expect(usesPhoneLayout('off', phone)).toBe(false);
    expect(usesPhoneLayout('on', laptop)).toBe(true);
    expect(usesPhoneLayout('auto', laptop)).toBe(false);
  });

  it('shows the log over a sheet, a sheet over the map', () => {
    expect(phoneTab({ log: true, sheet: true })).toBe('log');
    expect(phoneTab({ log: false, sheet: true })).toBe('sheet');
    expect(phoneTab({ log: false, sheet: false })).toBe('map');
  });
});
