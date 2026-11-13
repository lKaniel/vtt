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

## Uploading a pack from Setup

Setup's **Packs** box lists the installed packs and takes a new one: pick
the pack's folder (the one holding its `pack.json`) and the browser sends
`pack.json` first, then each file on its own, four at a time, then installs
the pack in one go (replacing one with the same id). Files wait in
`data/packs/.uploads/<id>/` until then, so an upload that broke off goes on
where it stopped when the same folder is picked again: files already there
with the same size are skipped. No zip is made, so a pack of many gigabytes
(JB2A) goes up the same way; one file may be up to 2 GB. Only the server's
admin can upload or delete packs (`/api/packs`, `server/src/http/pack-api.ts`).

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

Two more fields are for very big packs (Baileywiki's):

- A compendium with `"split": true` is a folder, not a file: `index.json`
  lists each document's `id`, `name` and optional `thumb` and `tags`, and
  each document is `<id>.json` beside it. The server keeps only the index
  and the GM's Assets tab lists it; a document is read when it is used
  (`compendiumDoc`).
- `"mediaIndex": "media-index.json"` adds search tags and a thumbnail to
  media files, by their path in the media folder:
  `{ "models/wall.glb": { "tags": ["3d-model"], "thumb": "models/wall.webp" } }`.
  A file named as another's thumbnail leaves the media list.
  `pnpm check-game` reports packs it can't read and documents a game's packs
  have that its system can't.

## Referring to pack files

A tile, token or scene names a pack file as `pack://<pack>/<path>`, e.g.
`pack://forest-tiles/media/trees/oak.webp`. The name says which pack a
picture comes from, so a game moved to another server tells you what to
install. A game's own files stay `/assets/<path>` (uploads go in
`assets/uploads/`).

## Compendium types

| Type                               | What happens with it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scene`                            | Copied into the game as a new scene (Assets tab, Packs, Import): a `scene.json` with `tiles`, `walls`, `lights` in it (`SceneEntrySchema`, `shared/scene-entry.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `actor`                            | Added to the Actors list (the system's actor schema).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `journal`, `rolltable`, `playlist` | Added to the Journal, Tables or Music tab, under a free id (`ENTRY_TYPES`, `shared/journals.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `prefab`                           | Things placed together, their middle in the middle of the screen, as one undo step: `{ "id", "name", "tiles", "walls", "lights", "sounds", "drawings", "notes" }` (`PrefabSchema`, `shared/prefabs.ts`). Two or more tiles go in a group named after it, and its walls and lights are fastened to it. `pick: "one"` is a brush (one of its tiles at random), `vary` a random `scale`, `rotation`, `tint` or picture each time, `fill` covers the scene's ground, `grid` the pixels a square it was made at (placing sizes it to the scene's squares). Optional `tags` and `thumb` for browsing. |
| `monster`, `item`, `spell`         | D&D rules content: while the pack is on, tokens can use them like SRD ones (`"monster": "<id>"`), and they appear in the Compendium tab.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `class`                            | A whole class (the Jaeger): the character creator offers it. Its automation can live in `class-automation.json` under its id, so the pack keeps only text.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `subclass`, `classFeature`         | A subclass or a feature (a pact boon, an invocation) for a class the game already has: each doc names its `"class"` and joins that class, replacing any of the same id. Their automation is in `class-automation.json`: a subclass's under the class's `subclasses`, a feature's under `packFeatures` (`pack-class-parts.ts`).                                                                                                                                                                                                                                                                  |
| `skill`                            | A skill the game adds to the 18: `{ "id", "name", "ability" }` (Wisdom when missing), listed on every sheet after them (`game-skills.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Other types are listed but not used yet.

## Packs and games

A game turns installed packs on in `game.json`:

```json
{ "id": "example", "name": "The crossroads", "packs": ["forest-tiles", "goblin-lairs"] }
```

or with the checkboxes in the GM's Assets tab (Packs). A pack whose
`pack.json` says `"everyGame": true` is on in every game on the server,
named or not: the place for a server's own homebrew (a private class pack
copied into `data/packs/`). The character creator offers the classes of the
packs a game uses, as well as its shared homebrew. Turning a pack on or
off is an edit like any other: Ctrl+Z undoes it. Packs for another system
are left out. A system's own packs are always on: D&D ships the SRD as
`dnd5e-srd-2014` (SRD 5.1) and `dnd5e-srd-2024` (SRD 5.2).

The rules read a game's content as the SRD of an edition plus the
`monster`, `item`, `spell`, `class`, `subclass`, `classFeature` and `skill` compendia
of the packs it uses (`contentWith(edition, compendia)` in `system-dnd5e/src/packs.ts`). The
server sends that content to every client when it joins (`packContent`),
so sheets, tooltips and the Compendium know pack monsters too.

## The GM's Assets tab

- **Media**: every picture, sound and video of the game's assets and of the
  packs it uses. Search by name and tag, pick a tag chip, filter by kind or
  pack. Drag a picture onto the map to place it as a tile at its own size,
  or click it to place it in view. **Upload** adds files to the game's
  `assets/uploads/` (pictures, sounds and videos up to 20 MB). Every picture
  box (a token's picture on the sheet's Token tab, a tile's, a scene's) has
  its own upload button too, and a web address typed into one is downloaded
  by the server into `assets/uploads/` (PNG, JPEG, WebP, GIF, AVIF; never
  addresses on the server's own network), so the map doesn't depend on
  another site letting it draw their picture. Videos show
  their first frame and play while the pointer is over them. A still picture
  shipped beside a video (`Bless_01_Thumb.webp` next to `Bless_01.webm`, or
  the same name under a `thumbs/` or `thumbnails/` folder, as JB2A does)
  becomes its preview; thumbnails are left out of the list.
- **Packs**: the system's packs and the installed ones, with a checkbox to
  use each in this game. Open a pack to see its compendia: import a scene,
  or add an actor to the Actors list.

## Art for the game's content

Turning a pack on dresses everything it has art for, with no picking per
item: spell, item, feature and condition icons (sheets, hotbar, action
bar, Compendium, character creator, effect badges, chat cards), monster
tokens, attack and spell animations on the map, and the loop a lasting
spell's template plays. Where a pack has nothing, the bundled paintings and
drawn icons stay.

A pack's art comes two ways, the first pack listed in game.json `packs`
winning for each thing:

- **An art file** (pack.json `"art": "art.json"`): slot → key → a file in
  the pack, or several (the same video in lengths). Keys are ids, or names
  as lowercase words joined by dashes (`potion-of-healing`). D&D's slots:
  `spell`, `item`, `feature`, `condition`, `monster` (tokens) and
  `animation` (keys below). The schema is `ArtFileSchema` in
  `core/pack-art.ts`.

  ```json
  {
    "spell": { "fireball": "media/icons/magic/fire/explosion.webp" },
    "monster": { "goblin": "media/tokens/Goblin.webp" }
  }
  ```

- **Matched by name** (the system's `packArt`, D&D's in
  `system-dnd5e/src/pack-art.ts` and `pack-animations.ts`):
  - a picture named like an SRD spell, item or condition is its icon;
    any picture under an `items/`, `spells/`, `features/`, `conditions/`
    or `statuses/` folder is, by its file name;
  - a picture under a folder with "token" in its name is the token of the
    monster it is named after, loosely (`BlackDragonAdult` → adult black
    dragon, `SwarmBats` → swarm of bats, `Goblin` → goblin boss);
  - videos in a folder named after a spell animate it (`spell:<id>`) and
    its lasting area (`zone:<id>`, a loop if there is one), picked in the
    colour of its damage: a projectile for spells that fly, a burst for
    areas and touches;
  - videos under `Weapon_Attacks`, `Unarmed_Attacks` or `Creature` folders
    whose name holds a weapon animate it (`melee:<weapon>`,
    `ranged:<weapon>`); a `Healing` folder animates healing without its own;
  - a creature under a spell wears that spell's loop (its `zone:<id>`
    look, when it is a loop: JB2A's Bless), and one with a condition the
    loop of a `Marker` folder named for it (`condition:<id>`:
    `MarkerPoison` poisoned, `MarkerFear` frightened, `MarkerCharm`,
    `MarkerStun`, `MarkerSleep`...), drawn under its face
    (`effect-loops.ts`).

  That is how JB2A's library lays itself out, so a JB2A pack needs no art
  file. A creature's own animation choice (its sheet's Animations page)
  still wins over the pack's. Videos made in lengths (`_05ft_`, `_30ft_`…)
  play the length nearest the shot.

The server sends a game's art to everyone with its pack content
(`packContent`), and puts a monster's pack token on its token itself, so
players who may not see what a creature is still see its picture.

### Foundry's icons

```
pnpm import-foundry-art "<Foundry>/resources/app/public/icons" "<Foundry data>/Data/systems/dnd5e" [--id foundry-icons] [--overwrite]
```

Makes a private pack from your own Foundry install: its core icons
(`media/icons/`), the system's icons and tokens (`media/dnd5e/`), and an
art file giving each spell, item, feature and monster of the system's
compendia the picture Foundry gives it. Foundry's art is licensed for your
own games: the pack stays in `data/packs`, never in the repo.

## Importing from Foundry VTT

```
pnpm import-foundry path/to/unzipped/module [--id <pack id>] [--overwrite]
```

Point it at an unzipped Foundry module, world or system folder (the one
with `module.json`, `world.json` or `system.json`). It makes a pack in
`data/packs/<id>/`:

- Every picture, sound and video is copied into `media/`, keeping its
  folders, which become search tags.
- Scenes become a `scene` compendium: from the module's compendia (the
  old `.db` files of Foundry v10 and before, or the LevelDB folders of v11
  and later, Adventures included), a world's `data/scenes`, and any scene
  saved with Foundry's "Export Data" (`fvtt-Scene-*.json`). The
  background becomes a locked ground tile where Foundry draws it (inside the
  scene's padding), tiles become image tiles, walls, doors and windows
  become ours, lights keep their radius (in feet), colour and animation.
- Scenes keep their drawings, map notes, measured templates (in feet; a
  rectangle as the square it covers), ambient sounds and (v12) regions:
  their shape, colour, and the behaviours we have a match for (scrolling
  text becomes a message).
- Journal entries (text and image pages), roll tables (weights from their
  ranges) and playlists (tracks whose file came along) become `journal`,
  `rolltable` and `playlist` compendia, from compendia and a world's
  `data/journal`, `tables` and `playlists`. Map notes point at the
  entries brought with them.
- It prints what it left out: tokens (place creatures from the Actors
  tab), tiles and sounds whose file isn't in the module, walls that block
  neither movement nor sight, page kinds and region behaviours we have no
  match for, and compendia of other types.

To play a whole Foundry world (its tokens and actors too), import it as a
game instead: see [foundry.md](foundry.md).

## Baileywiki

### Baileywiki's library on a server without Foundry

In **Assets > Baileywiki**, "Download Baileywiki's library" (once the
server is signed in, see below) does what Baileywiki's Content Module does
in Foundry: the server downloads the module itself (the public download
foundrymods.com gives Foundry, about 90 MB, into
`data/baileywiki-module/`, its code left out) and imports its compendia
into the pack `baileywiki` like the modules below: its Mass Edit presets as
`bw-prefabs-2d` and `bw-prefabs-3d` (about 10,000), its scene browsers'
thumbnails and Mass Edit's tags for Baileywiki's files, and an asset
catalog for Claude's map tools made from the prefabs: every picture and
model they place, at the prefab's size (`baileywiki-catalog.ts`; a catalog
measured from the files with `pnpm build-asset-catalog` stays). The module's own
pictures come with it. Every other Baileywiki file the prefabs name stays
on Baileywiki's server and is fetched the first time someone asks for it
(`baileywiki-files.ts`): the request for `/packs/baileywiki/media/<path>`
downloads it with the server's sign-in into the pack, which serves it from
then on. Only a browser at a table or in Setup can make the server fetch
one, and Baileywiki decides what the membership may have; a file it turns
down isn't asked for again for ten minutes. `VTT_BAILEYWIKI_MODULE` points
at another module manifest (the tests' stand-in).

A library an older server imported is imported again from the module on
disk when the server starts (`refreshBaileywikiLibrary`, the pack's
`import.json` says which importer made it), with nothing downloaded.

The sign-in and the list of Baileywiki's online scenes sit under
"Account and online scenes", below the library.

### The modules installed in Foundry

```
pnpm import-baileywiki "<Foundry data>/Data/modules" [--module <id>]... [--with <id>]... [--link]
```

Brings every Baileywiki module installed in Foundry (each `baileywiki-*`
folder, or only the `--module` ones) into the pack `baileywiki`, the way
Baileywiki's own modules work in Foundry:

- **Files**: each module's pictures, sounds, videos and 3D models (with
  their glTF buffers) go to `media/modules/<module>/<path>`, the path
  Foundry gives them, so a scene or prefab of one module finds another's
  files. Running it again copies only new or changed files; `--link`
  hard-links them instead when the pack is on the same drive. `--with`
  adds another module their scenes use (`canvas3dcompendium`).
- **Asset tags**: the tags Baileywiki put on its files in Mass Edit's
  virtual directory (`mass_edit_cache.json`) and each 3D model's thumbnail
  picture become the pack's media index, so the Assets tab finds
  "3d-model", "trees" or "lighting" and shows models by their picture.
- **Scenes**: every scene of the modules' compendia, split into
  `bw-scenes-2d` and `bw-scenes-3d` as Baileywiki's own 2D and 3D scene
  browsers list them (else 3D when 3D Canvas opens the scene in 3D), with
  those browsers' thumbnails and tags.
- **Prefabs**: Baileywiki's Mass Edit presets (lampposts with their light,
  tents with their walls, brushes of stalagmites, overlays that cover the
  scene, 3D buildings made of Token Attacher pieces), in `bw-prefabs-2d`
  and `bw-prefabs-3d` (those with a model, or filed under a "3D" folder),
  tagged with their folders and Baileywiki's tags. Placing one puts down
  everything in it as one group.

The GM finds them in **Assets > Baileywiki**: the library shows each of the
pack's prefab and scene compendia as thumbnails, searched by words and
narrowed by tag chips. Click a prefab to place it in the middle of the view
or drag it onto the map; click a scene to import it.

It prints the files the scenes name that no imported module has, by the
module they would come from. The pack is paid content: it stays in
`data/packs/`, never in the repo.

### Downloading with a Baileywiki sign-in

Setup has a **Baileywiki** box for the server's admin. "Open the
Baileywiki sign-in" opens content.baileywiki.com (Patreon, Discord or a
Baileywiki account); paste the code it shows and the server checks it
there and keeps it in `data/baileywiki.json`, never sending it to a
browser. "Show scenes" lists the scenes of Baileywiki's online compendia
(their 2D and 3D scene browsers) with their previews (from the Content
Module, so they show once the library is downloaded); tick some and
"Import" downloads each scene and the Baileywiki files it uses into a pack
`baileywiki` in `data/packs/`, keeping Baileywiki's paths, so a file shared
by many scenes comes down once. Importing a scene again replaces it in
place. Games then turn the pack on and import its scenes like any pack's.

A game's GM has the same sign-in and list in the Assets tab, under
**Baileywiki**: there an import also adds the scenes straight to the game
(and turns the Baileywiki pack on for it), as Foundry does. The sign-in is
the server's either way: the API takes `?game=<id>` and lets that game's GM
in.

It talks to Baileywiki's server the way their own Foundry module does
(`server/src/foundry/baileywiki-*.ts`): Baileywiki decides what the
membership unlocks, and what it turns down is listed as left out. Files from
other modules (JB2A, core icons) aren't Baileywiki's to give and stay out
too. The pack is paid content: it lives in the gitignored `data/` and is
never committed or shared. `VTT_BAILEYWIKI_URL` points the server at
another content server (the tests' stand-in).

## Asset catalogs

A pack may carry a `catalog.json`: every map piece in it with its size, for
Claude's map tools (`find_assets`, `build_scene` props, scatter and grounds,
see claude-bridge.md) and the GM's search (`findAssets`, GM only). Each
asset has an `id`, its `src` in the pack, a `kind` (`tile`: a picture laid
on the map; `texture`: a tileable picture for ground and floors; `model`: a
glTF model), a `name`, `tags`, its size `w` and `h` in feet, a model's
`height`, a `thumb` and `overhead` (tree crowns, roofs). The schema is
`AssetCatalogSchema` in `core/asset-catalog.ts`.

`pnpm build-asset-catalog <pack folder>` writes it from the pack's `media/`:
picture sizes come from the file headers at 150 px a 5 ft square (Baileywiki's
own scale; a file named `200dpi` uses 200), model sizes from the glTF
bounds at 5 ft a unit. It leaves out icons, thumbnails, tokens, PBR maps and
side-on art, and folds a model's preview picture into the model. Options:
`--px-per-square`, `--feet-per-unit`, `--include <regex>`, `--top <folders>`
(`baileywiki-*` for every folder starting so), `--media` and `--prefix` to
read files from elsewhere (Foundry's `Data/modules`), `--usage <file>` (px a
square per file or folder, measured from scenes that use them) and `--out`.
A `media-index.json` beside `pack.json` adds its tags and previews.

For the Baileywiki pack (`pnpm import-baileywiki` puts its modules in
`media/modules/`): `pnpm build-asset-catalog data/packs/baileywiki --media
data/packs/baileywiki/media/modules --prefix media/modules/ --top
'baileywiki-*'` (about 22,000 tiles, 640 textures and 5,000 models, a
minute).

## Not done yet

- Foundry actors and items in a pack's compendia (a world import reads
  them, see [foundry.md](foundry.md)).
- Mass Edit presets' spawn scripts other than "cover the scene", and Monk's Active Tiles on prefab tiles.
- Installing a pack from the browser (zip upload) and per-pack permissions.
- Art: picking a template's texture by hand in the inspector.
