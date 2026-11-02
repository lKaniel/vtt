import { join, normalize, sep } from 'node:path';
import { type PluginManifest, PluginManifestSchema } from '@vtt/core';
import { type Found, readManifests } from './manifests.ts';

// The plugins installed on this server: data/plugins/<id>/, each with a
// plugin.json (see core/plugins.ts) and its files. A game turns on the ones
// it uses (game.json `plugins`). load() reads them all again.

type Installed = Found<PluginManifest>;

export class PluginStore {
  private plugins = new Map<string, Installed>();
  /** What load() could not read, one line each. */
  problems: string[] = [];

  constructor(readonly dir: string) {}

  async load(): Promise<void> {
    const problems: string[] = [];
    const found = await readManifests(this.dir, 'plugin.json', PluginManifestSchema, problems);
    this.plugins = new Map(found.map((f) => [f.manifest.id, f]));
    this.problems = problems;
  }

  list(): PluginManifest[] {
    return [...this.plugins.values()].map((p) => p.manifest);
  }

  get(id: string): PluginManifest | undefined {
    return this.plugins.get(id)?.manifest;
  }

  /** The file at `path` inside a plugin's folder (`/plugins/<id>/<path>`), if it stays inside. */
  file(id: string, path: string): string | undefined {
    const installed = this.plugins.get(id);
    if (!installed) return undefined;
    const root = normalize(installed.dir);
    const file = normalize(join(root, path));
    return file.startsWith(root + sep) ? file : undefined;
  }
}
