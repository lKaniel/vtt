import type { FoundryImportReport } from '@vtt/shared';

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
    plural(r.media, 'file'),
  ].join(', ');
}
