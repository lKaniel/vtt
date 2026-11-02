# Plugins

A plugin works like a Foundry module. It is JavaScript that a server
admin installs once. Each game then turns it on or off for itself. Every
browser at a game that uses a plugin loads its code. The code gets `vtt`,
the same scripting API that script macros use ([scripting.md](scripting.md)).
So a plugin can listen for hooks, read what that player was sent, and act
as that player. The server checks everything it does, like any click.

A plugin runs in the browser of every player at the game. Install only
code you trust, the same as you would a Foundry module.

## Where plugins live

```
data/plugins/<id>/          one folder per plugin (VTT_DATA, or data/ next to the game folder)
  plugin.json               the manifest
  main.js                   its ES module (or wherever `main` says)
  ...                       anything else it loads: styles, pictures, more modules
```

Everything in the folder is served at `/plugins/<id>/<path>`, so a module
can `import './more.js'` and load pictures by relative URL. The server
reads `data/plugins/` when it starts. It reads them again whenever the GM
opens the Plugins list (Assets tab, Plugins), so a plugin copied in shows
up without a restart.

## plugin.json

```json
{
  "id": "turn-alert",
  "name": "Turn alert",
  "version": "1.0.0",
  "description": "Says whose turn it is.",
  "main": "main.js",
  "styles": ["turn-alert.css"]
}
```

| Field                   | What it is                                                        |
| ----------------------- | ----------------------------------------------------------------- |
| `id`                    | lowercase letters, digits and dashes; the same as the folder name |
| `name`                  | what the Plugins list shows                                       |
| `version`               | default `"1.0.0"`                                                 |
| `system`                | the system it is for (`"dnd5e"`), or `null` (the default) for any |
| `main`                  | its ES module inside the folder, default `main.js`                |
| `styles`                | stylesheets inside the folder, added to the page                  |
| `description`, `author` | shown in the Plugins list                                         |

The schema is `PluginManifestSchema` in `packages/core/src/plugins.ts`.

## The main module

The module's default export is called once with `vtt`, after the player
has joined. It may be `async`. Anything it sets up then lasts until the
page closes.

```js
// data/plugins/turn-alert/main.js
export default function (vtt) {
  vtt.hooks.on('combat', (fight) => {
    const up = fight && vtt.token(fight.order[fight.turn].token);
    if (up) vtt.notify(`${up.name}'s turn`);
  });
}
```

A module with no default export can do its own setup when it is
imported. It can reach `vtt` on `window`.

If a plugin fails to load or start, it shows as an error ("Plugin <id>
failed: …"). The other plugins and the table carry on.

## Turning one on

The GM opens the Assets tab, then Plugins. The list shows every installed
plugin that fits the game's system. Ticking one adds it to game.json
`plugins` (one undo step). Everyone at the table starts over and loads
it. A plugin that is turned off stays loaded in a browser until that page
reloads. `pnpm check-game` warns about a plugin that game.json names but
the server does not have, or that is for another system.

## Code

- Server:
  - `plugin-store.ts`: reads `data/plugins/`.
  - `game-plugins.ts`: a game's plugins, what clients load, and what check-game warns about.
  - `pack-actions.ts`: answers the GM's `plugins` list.
  - `welcome.ts`: sends each client the plugins to load.
  - `http.ts`: serves `/plugins/`.
- Client:
  - `scripting/plugins.ts`: the loader.
  - `ui/PluginsView.tsx`: the GM's list.
