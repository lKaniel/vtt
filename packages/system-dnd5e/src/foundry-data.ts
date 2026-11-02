// Loose readers for Foundry VTT documents: their data comes from many
// Foundry and dnd5e versions, so every field may be missing or odd.

export type Loose = Record<string, unknown>;

export const obj = (x: unknown): Loose => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Loose) : {});

/** The value at a dotted path, e.g. at(actor, 'system.attributes.hp'). */
export const at = (x: unknown, path: string): unknown => path.split('.').reduce<unknown>((o, key) => obj(o)[key], x);

export const num = (x: unknown): number | undefined => {
  const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

export const str = (x: unknown): string | undefined => (typeof x === 'string' && x ? x : undefined);

export const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/** HTML as plain text, as journal-free descriptions want it. */
export const plainText = (html: string): string =>
  html
    .replace(/<\/?(a|b|i|u|em|strong|span|code|sub|sup)\b[^<>]*>/gi, '')
    .replace(/<[^<>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** A field only when it has a value: spread it into an object. */
export const opt = <K extends string, V>(key: K, value: V | undefined | false): Partial<Record<K, V>> =>
  value === undefined || value === false ? {} : ({ [key]: value } as Record<K, V>);
