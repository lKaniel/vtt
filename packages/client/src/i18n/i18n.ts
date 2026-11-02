// Translations (docs/i18n.md). The table's words are looked up by key in
// string tables: English ships with the table, other languages are offered
// by plugins (plugin.json `languages`) or added in code. A player picks one
// per browser; a word the language lacks falls back to English, then to the
// key itself, so a half-done translation still works.

export type Words = Readonly<Record<string, string>>;
type Load = () => Promise<Words>;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

const KEY = 'vtt:lang';
const ENGLISH = 'en';

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function fill(text: string, vars?: Readonly<Record<string, string | number>>): string {
  return vars ? text.replace(/\{(\w+)\}/g, (all, name: string) => String(vars[name] ?? all)) : text;
}

export class I18n {
  /** The language in use. */
  lang = ENGLISH;
  private readonly wanted: string;
  private readonly names = new Map([[ENGLISH, 'English']]);
  private readonly sources = new Map<string, Load[]>();
  private readonly loaded = new Map<string, Words>();
  private readonly extra = new Map<string, Record<string, string>>();
  private readonly listeners = new Set<() => void>();
  /** Goes up on every change, for React to notice. */
  version = 0;

  constructor(
    private readonly english: Words,
    private readonly storage: Storage | undefined = browserStorage(),
  ) {
    this.wanted = this.stored() ?? ENGLISH;
  }

  /** The words for `key` in the language in use, with `{name}` filled from `vars`. */
  t(key: string, vars?: Readonly<Record<string, string | number>>): string {
    return fill(this.lookup(this.lang, key) ?? this.lookup(ENGLISH, key) ?? key, vars);
  }

  /** The languages there are, English first. */
  languages(): { lang: string; name: string }[] {
    return [...this.names].map(([lang, name]) => ({ lang, name }));
  }

  /** Offers a language (or more words for one); taken up at once if it is the one in use or the one picked. */
  offer(lang: string, name: string, load: Load): Promise<void> {
    if (!this.names.has(lang)) this.names.set(lang, name);
    this.sources.set(lang, [...(this.sources.get(lang) ?? []), load]);
    this.changed();
    const take = lang !== ENGLISH && (lang === this.lang || lang === this.wanted);
    return take ? this.use(lang, false).catch(() => undefined) : Promise.resolve();
  }

  /** Adds words for a language right away: a plugin's own keys. */
  add(lang: string, words: Words): void {
    this.extra.set(lang, { ...this.extra.get(lang), ...words });
    this.changed();
  }

  /** Switches to `lang` (an offered one, or English); remembers it in this browser unless `remember` is false. */
  async use(lang: string, remember = true): Promise<void> {
    if (lang !== ENGLISH && !this.sources.has(lang)) return;
    if (lang !== ENGLISH) {
      const parts = await Promise.all((this.sources.get(lang) ?? []).map((load) => load()));
      this.loaded.set(lang, Object.assign({}, ...parts) as Words);
    }
    this.lang = lang;
    if (remember) this.remember(lang);
    this.changed();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private lookup(lang: string, key: string): string | undefined {
    if (lang === ENGLISH) return this.english[key] ?? this.extra.get(ENGLISH)?.[key];
    return this.loaded.get(lang)?.[key] ?? this.extra.get(lang)?.[key];
  }

  private changed(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  private stored(): string | undefined {
    try {
      return this.storage?.getItem(KEY) ?? undefined;
    } catch {
      return undefined;
    }
  }

  private remember(lang: string): void {
    try {
      this.storage?.setItem(KEY, lang);
    } catch {
      // Not kept: the language holds until the page reloads.
    }
  }
}
