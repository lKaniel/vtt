import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18n } from './i18n.ts';

// Translations (docs/i18n.md): the table's words come from string tables by
// key, English unless the player picked another language a plugin (or the
// table itself) offers. A missing word falls back to English, then the key.

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
};

const english = { 'settings.title': 'Settings', 'chat.rolled': '{name} rolled {total}' };

afterEach(() => vi.restoreAllMocks());

describe('translations', () => {
  it('give the English words, filling in names, and the key when there are none', () => {
    const i18n = new I18n(english, memory());
    expect(i18n.t('settings.title')).toBe('Settings');
    expect(i18n.t('chat.rolled', { name: 'Bram', total: 17 })).toBe('Bram rolled 17');
    expect(i18n.t('nope.missing')).toBe('nope.missing');
    expect(i18n.lang).toBe('en');
  });

  it('switch to a language someone offers, falling back to English for words it lacks', async () => {
    const storage = memory();
    const i18n = new I18n(english, storage);
    void i18n.offer('de', 'Deutsch', () => Promise.resolve({ 'settings.title': 'Einstellungen' }));
    expect(i18n.languages()).toEqual([
      { lang: 'en', name: 'English' },
      { lang: 'de', name: 'Deutsch' },
    ]);
    const changed = vi.fn();
    i18n.subscribe(changed);
    await i18n.use('de');
    expect(i18n.t('settings.title')).toBe('Einstellungen');
    expect(i18n.t('chat.rolled', { name: 'Bram', total: 3 })).toBe('Bram rolled 3');
    expect(changed).toHaveBeenCalled();
    expect(storage.getItem('vtt:lang')).toBe('de');
  });

  it('remember the language and take it up once someone offers it', async () => {
    const storage = memory();
    storage.setItem('vtt:lang', 'de');
    const i18n = new I18n(english, storage);
    expect(i18n.lang).toBe('en');
    await i18n.offer('de', 'Deutsch', () => Promise.resolve({ 'settings.title': 'Einstellungen' }));
    expect(i18n.lang).toBe('de');
    expect(i18n.t('settings.title')).toBe('Einstellungen');
  });

  it('merge the words of everyone offering the same language, and let plugins add their own keys', async () => {
    const i18n = new I18n(english, memory());
    void i18n.offer('de', 'Deutsch', () => Promise.resolve({ 'settings.title': 'Einstellungen' }));
    void i18n.offer('de', 'Deutsch', () => Promise.resolve({ 'alert.turn': '{name} ist dran' }));
    i18n.add('en', { 'alert.turn': "{name}'s turn" });
    expect(i18n.t('alert.turn', { name: 'Bram' })).toBe("Bram's turn");
    await i18n.use('de');
    expect(i18n.t('alert.turn', { name: 'Bram' })).toBe('Bram ist dran');
    expect(i18n.t('settings.title')).toBe('Einstellungen');
  });

  it('stay in English when a language fails to load', async () => {
    const i18n = new I18n(english, memory());
    void i18n.offer('xx', 'Broken', () => Promise.reject(new Error('404')));
    await expect(i18n.use('xx')).rejects.toThrow('404');
    expect(i18n.lang).toBe('en');
    await i18n.use('zz');
    expect(i18n.lang).toBe('en');
  });
});
