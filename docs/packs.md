# Asset packs

An **asset pack** is content and media a game can use without owning it:
maps, tiles, token art and sounds, scenes ready to copy in, and (for a
system) monsters, items and spells. A game has its own `assets/` folder for
uploads; packs are shared by every game on the server.

## Where packs live

```
data/packs/<id>/            one folder per pack (VTT_DATA, or data/ next to the game folder)
  pack.json                 the manifest
  media/                    pictures, sounds and videos; the folders become search tags
  compendia/<id>.json       each compendium: a JSON array of documents
```

The server reads `data/packs/` when it starts and again whenever the GM
opens the Assets tab, so a pack copied in shows up without a restart. Only
the `media/` folder is served (at `/packs/<id>/...`); compendia go out only
to a GM who asks for them. Imported packs stay on your server: only SRD
content (CC-BY-4.0) ships in the repo.

## pack.json

```json
{
  "id": "forest-tiles",
  "name": "Forest tiles",
  "version": "1.0.0",
  "system": null,
  "license": "private",
  "compendia": [{ "id": "trees", "name": "Trees", "type": "scene", "path": "compendia/trees.json" }],
  "media": "media/"
}
```

| Field                                        | What it is                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `id`                                         | Lowercase letters, digits and dashes; the same as the folder name.                             |
| `name`                                       | What the Packs list shows.                                                                     |
| `version`                                    | Default `"1.0.0"`.                                                                             |
| `system`                                     | The system it is for (`"dnd5e"`), or `null` (the default) for any: maps, tiles, sounds.        |
| `compendia`                                  | `id`, `type`, `path` inside the pack, optional `name` and `rules` (an edition; missing = all). |
| `media`                                      | The media folder inside the pack, default `"media/"`.                                          |
| `description`, `author`, `license`, `source` | Shown in the Packs list. The Foundry import sets `source`.                                     |

The schema is `PackManifestSchema` in `packages/core/src/packs.ts`.
`pnpm check-game` reports packs it can't read and documents a game's packs
have that its system can't.

## Referring to pack files

A tile, token or scene names a pack file as `pack://<pack>/<path>`, e.g.
`pack://forest-tiles/media/trees/oak.webp`. The name says which pack a
picture comes from, so a game moved to another server tells you what to
install. A game's own files stay `/assets/<path>` (uploads go in
`assets/uploads/`).

## Compendium types

| Type                       | What happens with it                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scene`                    | Copied into the game as a new scene (Assets tab, Packs, Import): a `scene.json` with `tiles`, `walls`, `lights` in it (`SceneEntrySchema`, `shared/scene-entry.ts`). |
| `actor`                    | Added to the Actors list (the system's actor schema).                                                                                                                |
| `monster`, `item`, `spell` | D&D rules content: while the pack is on, tokens can use them like SRD ones (`"monster": "<id>"`), and they appear in the Compendium tab.                             |

Other types are listed but not used yet.

## Packs and games

A game turns installed packs on in `game.json`:

```json
{ "id": "example", "name": "The crossroads", "packs": ["forest-tiles", "goblin-lairs"] }
```

or with the checkboxes in the GM's Assets tab (Packs). Turning a pack on or
off is an edit like any other: Ctrl+Z undoes it. Packs for another system
are left out. A system's own packs are always on: D&D ships the SRD as
`dnd5e-srd-2014` (SRD 5.1) and `dnd5e-srd-2024` (SRD 5.2).

The rules read a game's content as the SRD of an edition plus the
`monster`, `item` and `spell` compendia of the packs it uses
(`contentWith(edition, compendia)` in `system-dnd5e/src/packs.ts`). The
server sends that content to every client when it joins (`packContent`),
so sheets, tooltips and the Compendium know pack monsters too.

## The GM's Assets tab

- **Media**: every picture, sound and video of the game's assets and of the
  packs it uses. Search by name and tag, pick a tag chip, filter by kind or
  pack. Drag a picture onto the map to place it as a tile at its own size,
  or click it to place it in view. **Upload** adds files to the game's
  `assets/uploads/` (pictures, sounds and videos up to 20 MB).
- **Packs**: the system's packs and the installed ones, with a checkbox to
  use each in this game. Open a pack to see its compendia: import a scene,
  or add an actor to the Actors list.

## Importing from Foundry VTT

```
pnpm import-foundry path/to/unzipped/module [--id <pack id>] [--overwrite]
```

Point it at an unzipped Foundry module, world or system folder (the one
with `module.json`, `world.json` or `system.json`). It makes a pack in
`data/packs/<id>/`:

- Every picture, sound and video is copied into `media/`, keeping its
  folders, which become search tags.
- Scenes become a `scene` compendium: from the module's compendia in the
  old `.db` format (Foundry v10 and before), a world's `data/scenes.db`, and
  any scene saved with Foundry's "Export Data" (`fvtt-Scene-*.json`). The
  background becomes a locked ground tile where Foundry draws it (inside the
  scene's padding), tiles become image tiles, walls, doors and windows
  become ours, lights keep their radius (in feet), colour and animation.
- It prints what it left out: tokens (place creatures from the Actors
  tab), tiles whose picture isn't in the module, walls that block neither
  movement nor sight, and compendia of other types.

Foundry v11 and later keep compendia in LevelDB databases, which can't be
read yet. Open the module in Foundry, use "Export Data" on its scenes, put
the files in the module folder and import again.

## Not done yet

- Reading Foundry v11+ LevelDB compendia, and Foundry actors, items and
  journals (their data is system-specific).
- Tile prefabs (a `tile` compendium dropped as a group), playlists from
  sound packs (step 12 adds ambient sounds).
- Installing a pack from the browser (zip upload) and per-pack permissions.
