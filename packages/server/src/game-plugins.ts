import type { PluginInfo, PluginLoad, PluginManifest } from '@vtt/core';
import type { PluginStore } from './plugin-store.ts';

// The plugins of one game: those it may use (any system, or its own), the
// ones it turned on (game.json `plugins`) as every client loads them, and
// what check-game warns about.

interface GameFile {
  system: string;
  plugins?: string[];
}

const fits = (m: PluginManifest, game: GameFile) => m.system === null || m.system === game.system;

/** The installed plugins the game may use, for the GM's list. */
export function pluginInfos(store: PluginStore | undefined, game: GameFile): PluginInfo[] {
  const on = new Set(game.plugins ?? []);
  return (store?.list() ?? []).filter((m) => fits(m, game)).map((m) => ({ ...m, enabled: on.has(m.id) }));
}

/** What every client loads: the turned-on plugins that are installed and fit, in game.json's order. */
export function pluginLoads(store: PluginStore | undefined, game: GameFile): PluginLoad[] {
  return (game.plugins ?? []).flatMap((id) => {
    const m = store?.get(id);
    if (!m || !fits(m, game)) return [];
    const url = (path: string) => `/plugins/${id}/${path}`;
    return [{ id, name: m.name, main: url(m.main), styles: m.styles.map(url) }];
  });
}

/** Plugins game.json names that this server can't load for it. */
export function gamePluginIssues(store: PluginStore | undefined, game: GameFile): string[] {
  return (game.plugins ?? []).flatMap((id) => {
    const m = store?.get(id);
    if (!m) return [`plugin "${id}" is not installed (data/plugins/${id}/)`];
    return fits(m, game) ? [] : [`plugin "${id}" is for ${m.system}, not ${game.system}`];
  });
}
