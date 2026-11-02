import { z } from 'zod';
import { InnerPathSchema as innerPath, ManifestFields } from './packs.ts';

// Plugins, like Foundry modules: JavaScript a server admin installs in
// data/plugins/<id>/ (a plugin.json and its files) and a GM turns on per
// game (game.json `plugins`). Every client at that game loads the plugin's
// main module, which gets the scripting API (docs/plugins.md).

/** plugin.json */
export const PluginManifestSchema = z.object({
  ...ManifestFields,
  /** Its ES module, inside the folder; its default export is called with `vtt`. */
  main: innerPath.default('main.js'),
  /** Stylesheets inside the folder, added to the page. */
  styles: z.array(innerPath).default([]),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** A plugin as the GM's list shows it. */
export interface PluginInfo extends PluginManifest {
  /** This game uses it. */
  enabled: boolean;
}

/** What a client loads for one plugin the game turned on: URLs on the server. */
export interface PluginLoad {
  id: string;
  name: string;
  main: string;
  styles: string[];
}
