import { describe, expect, it } from 'vitest';
import { BUNDLED, offerBundled } from './bundled.ts';
import { EN } from './en.ts';
import { I18n } from './i18n.ts';

// The languages that ship with the table (docs/i18n.md): each one has every
// English key, and each phrase keeps the {names} its English fills in.

const names = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort((a, b) => a.localeCompare(b));

describe('bundled languages', () => {
  it('are Russian and Ukrainian', () => {
    expect(BUNDLED.map((b) => b.lang)).toEqual(['ru', 'uk']);
  });

  it.each(BUNDLED)('$lang has every English key and no others', async ({ load }) => {
    const words = await load();
    expect(Object.keys(words).sort((a, b) => a.localeCompare(b))).toEqual(
      Object.keys(EN).sort((a, b) => a.localeCompare(b)),
    );
  });

  it.each(BUNDLED)('$lang keeps the {names} of each phrase', async ({ load }) => {
    const words = await load();
    const wrong = Object.entries(EN).filter(([key, text]) => names(words[key] ?? '').join() !== names(text).join());
    expect(wrong.map(([key]) => key)).toEqual([]);
  });

  it('show up in the Language list and switch the words', async () => {
    const i18n = new I18n(EN, undefined);
    offerBundled(i18n);
    expect(i18n.languages().map((l) => l.name)).toEqual(['English', 'Русский', 'Українська']);
    await i18n.use('uk');
    expect(i18n.t('settings.title')).toBe('Ваші налаштування');
    await i18n.use('ru');
    expect(i18n.t('settings.title')).toBe('Ваши настройки');
  });
});
