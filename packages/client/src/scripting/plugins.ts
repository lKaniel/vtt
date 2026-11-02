import type { PluginLoad } from '@vtt/core';

// Loading the plugins a game turned on (docs/plugins.md): each one's styles
// go on the page and its main module is imported; a default export is
// called with `vtt`. A plugin loads once per page: one turned off stays
// until the page reloads. A failing plugin is reported and the rest load.

type Failed = (plugin: string, message: string) => void;

export class PluginLoader {
  private readonly done = new Set<string>();
  /** Imports a module by URL (the browser's import(); tests swap it). */
  importModule: (url: string) => Promise<unknown> = (url) => import(/* @vite-ignore */ url);
  /** Puts a stylesheet on the page. */
  addStyle: (url: string) => void = addStylesheet;

  constructor(
    private readonly vtt: unknown,
    private readonly failed: Failed,
  ) {}

  /** Loads, in order, the plugins not loaded yet. */
  async load(plugins: readonly PluginLoad[]): Promise<void> {
    for (const plugin of plugins) {
      if (this.done.has(plugin.id)) continue;
      this.done.add(plugin.id);
      await this.start(plugin);
    }
  }

  /** The ids of the plugins loaded on this page. */
  loaded(): string[] {
    return [...this.done];
  }

  private async start(plugin: PluginLoad): Promise<void> {
    try {
      for (const url of plugin.styles) this.addStyle(url);
      const mod = (await this.importModule(plugin.main)) as { default?: unknown };
      if (typeof mod.default === 'function') await (mod.default as (vtt: unknown) => unknown)(this.vtt);
    } catch (e) {
      this.failed(plugin.id, e instanceof Error ? e.message : String(e));
    }
  }
}

function addStylesheet(url: string): void {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.append(link);
}
