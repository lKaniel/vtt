import type { FoundryImportReport, LeftOut } from '@vtt/shared';
import { t } from './i18n/index.ts';

// The lobby's words for what a Foundry world import brought (ui/FoundryImport.tsx).

const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;

/** "3 scenes, 12 actors, ..." */
export function importSummary(r: FoundryImportReport): string {
  return [
    plural(r.scenes, 'scene'),
    plural(r.actors, 'actor'),
    plural(r.tokens, 'token'),
    `${r.journals} journal ${r.journals === 1 ? 'entry' : 'entries'}`,
    plural(r.tables, 'table'),
    plural(r.playlists, 'playlist'),
    ...(r.macros ? [plural(r.macros, 'macro')] : []),
    plural(r.media, 'file'),
  ].join(', ');
}

/** Where a kind of left-out thing was, and some of their names: "in Crypt, Inn · tree, torch, …". */
export function leftOutDetail(l: LeftOut): string {
  const places = l.places.join(', ');
  let where = '';
  if (l.placeCount > l.places.length) where = t('foundry.inMany', { count: l.placeCount, places });
  else if (l.placeCount) where = t('foundry.in', { places });
  const more = l.count > l.examples.length ? ', …' : '';
  const examples = l.examples.length ? l.examples.join(', ') + more : '';
  return [where, examples].filter(Boolean).join(' · ');
}
