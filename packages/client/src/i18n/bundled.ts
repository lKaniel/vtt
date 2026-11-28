import type { I18n, Words } from './i18n.ts';

// The languages that ship with the table, beside English. Each is loaded
// only when someone picks it, so English players never download them.

export interface Bundled {
  readonly lang: string;
  readonly name: string;
  readonly load: () => Promise<Words>;
}

export const BUNDLED: readonly Bundled[] = [
  { lang: 'ru', name: 'Русский', load: async () => (await import('./ru.json')).default },
  { lang: 'uk', name: 'Українська', load: async () => (await import('./uk.json')).default },
];

/** Puts the bundled languages in the Language list. */
export function offerBundled(i18n: I18n): void {
  for (const b of BUNDLED) void i18n.offer(b.lang, b.name, b.load);
}
