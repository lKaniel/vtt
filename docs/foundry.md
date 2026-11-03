# Coming from Foundry VTT

Two imports read Foundry's files directly: Foundry doesn't have to run (it can
stay open), no Foundry module is needed, and nothing in the Foundry folder is
changed. Both read every Foundry version's databases: the NeDB `.db` files of
v10 and before, and the LevelDB folders of v11 and later (a small reader of
our own, `server/src/foundry/leveldb.ts`, so no native module is installed).

| You want                                                  | Use                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| To keep playing a campaign: the whole world as a new game | **Import a Foundry world** (lobby, the admin) or `pnpm import-foundry-world` |
| Maps, art and handouts from a module to pick from         | `pnpm import-foundry` makes an asset pack (see [packs.md](packs.md))         |

## Importing a world

In the lobby, the server's admin has **Import a Foundry world**: give it the
world's folder on the server's computer, the one with `world.json`, usually

- Windows: `%LOCALAPPDATA%\FoundryVTT\Data\worlds\<world>`
- macOS: `~/Library/Application Support/FoundryVTT/Data/worlds/<world>`
- Linux: `~/.local/share/FoundryVTT/Data/worlds/<world>`

It becomes a new lobby game (`data/games/<id>/`, named after the world) with
you as its GM; the box then lists what was left out. From a terminal:

```
pnpm import-foundry-world <world folder> [--name <game name>] [--data <Foundry Data folder>]
```

(its GM is a `Gamemaster` player without a password; a running server lists
the game after a restart).

What comes along:

- **Scenes**, all of them, the active one as the game's scene: background,
  tiles, walls and doors, lights, drawings, map notes, measured templates,
  ambient sounds and regions (see "Importing from Foundry VTT" in packs.md
  for how each is read), and the scene's playlist. The foreground picture
  becomes a roof tile that never fades; whether a scene is in the
  navigation bar, its name there and its thumbnail come along too.
- **Foundry v14** scenes: the background comes from the lowest floor that
  has one (v14 keeps it in the scene's `levels`), templates that v14 stores
  as regions become templates again.
- **3D Canvas** (levels-3d-preview): model tiles become image tiles with a
  `model` (glTF with its files, even a text glTF named `.glb` whose meshes
  and textures sit in sibling folders like `../zz-meshes`, depth as height, elevation, rotation, tilt,
  fill and tint), tokens keep their figure, and scenes keep their sky,
  table colour and whether walls show (`view3d`). Drawn polygons (cliffs,
  ledges, pools) become tiles with a `solid` of their outline, height,
  elevation and colour. Other drawn shapes (cones, spheres), HeroForge
  figures and other non-glTF models stay behind and are reported. Files a
  world names by their Forge address (`https://assets.forge-vtt.com/<id>/…`)
  are looked up in the Data folder by their path. See docs/view3d.md.
- **Floors**, from v14's scene levels or the Levels module's flags (see
  "Scene levels" in game-format.md): one level per floor, named by the
  tightest band starting there (v14's migration makes overlapping bands).
  Tiles, walls, lights, sounds, notes, drawings and regions go on the
  floors their v14 `levels` or their Levels range (elevation or
  `rangeBottom` to `rangeTop`; Wall Height for walls) cover. The floors
  seen from each one come from v14's visibility, or are all the floors
  below with Levels. v14's change-level regions become stairs (two floors)
  or an elevator (more); so do Levels' stair (both ways, up only, down
  only) and elevator drawings, and its stair and elevator region scripts.
  Holes in a floor are left out. Upper floors with their own picture get
  it as a tile on that floor. Tokens keep their elevation, raised onto the
  floor v14 says they are on.
- **Weather**: FXMaster's rain, snow, clouds, fog, embers and birds (crows,
  eagles, bats) become the scene's weather layers, about as thick and with
  their tint; without FXMaster, Foundry's own scene weather. FXMaster's
  filters (colour, lightning) and its rats stay behind.
- **Monk's Active Tiles** as tile triggers: clicked (or double-clicked)
  tiles are clicked here, right-click and manual ones are the GM's, and
  "on enter" ones fire when a creature walks on. Picture swaps (and the
  tile's picture list, patterns spelled out), sounds, show and hide,
  switching lights and other tiles' triggers on and off, teleports, doors
  and chat notes come along; things are found by Tagger tag or Foundry id.
  A trigger with Monk's jumps (a dialog, anchors) keeps the path a click
  most likely takes. Macros, "alter" and the rest are reported.
- **Lights** put out in Foundry stay out until a trigger or the GM lights them.
- **Tokens** on their actors: a linked token stays linked; an unlinked one
  becomes a copy whose own name, picture, size and hit points go in its
  `delta`. Hidden tokens stay hidden. A token with no actor in the world is
  one of two things: a prop (a tree, a barrel, a lit brazier: its picture
  sits in a map-art folder, or it has none) becomes a tile of its size,
  with its light as a light of its own; a creature becomes an unlinked
  copy of a new actor named after it (one actor for every "Bandit"), which
  the GM can fill in later.
- **Players**: each Foundry user becomes a player of the game with the same
  name and colour (and avatar); Foundry's roles map to ours (player,
  trusted, and assistant GM or gamemaster to GM). The first gamemaster is
  you, the one importing.
- **Actors**, in their folders ("Monsters / Goblins"), with their token art,
  and the levels Foundry gave everyone and each user (a player owns their
  character as before). The sheet is read by the game system (see below);
  an Item Piles actor becomes a pile of loot or a merchant.
- Journal entries and roll tables keep who may see them, the same way.
- **Journal entries** (text and image pages), **roll tables** and
  **playlists**, in their folders.
- **Pictures and sounds** those use, copied into the game's
  `assets/foundry/` under their Foundry path. Foundry names files by their
  place in its Data folder, so a map in `Data/assets/` is found too: the
  Data folder is the one the world sits in (`Data/worlds/<world>`), or the
  one given.
- The **rules edition**: a dnd5e world set to the modern rules plays 2024.
- **Time**: the game clock starts where Foundry's stood, on Simple
  Calendar's calendar and date when the world uses it, with SmallTime's
  dawn and dusk. Scenes SmallTime darkens with the time of day follow the
  clock, and a light that shines only at night (or only by day) keeps
  that band.

### D&D 5e sheets

`system-dnd5e/src/foundry-actor.ts` reads Foundry's dnd5e actors (system
v1 to v5 field names):

- A monster the SRD has by name (Goblin, Bandit Captain) uses that stat
  block, keeping its wounds.
- Any other creature is read from its numbers: abilities, hit points, a flat
  or natural AC, speed, senses, size, resistances, skills; an NPC's
  proficiency from its challenge rating and its weapons as attacks; a
  character's class and level from its class items.
- Items, spells and features are matched to the SRD by name ("Leather
  Armor", "Crossbow, light"); other items become the sheet's own items
  (weapons and armor with their numbers), other features the sheet's own
  features with their text. The class's own features come with the class.
  A multiclassed character keeps every class (`stats.classes`, the
  original class first, with its subclass); classes the SRD doesn't have,
  like a Blood Hunter, keep their name and levels.
- Spells the SRD doesn't have become the sheet's own spells: level, school,
  casting time, range, duration and, from their activities, the attack or
  save and the damage they roll (with its upcasting). One that does nothing
  we can read comes as its text, for the GM to apply.
- Where the creature stands: its coins, spent spell slots and hit dice,
  exhaustion, death saves, what is packed in which bag, and the magic items
  it is attuned to.
- Active effects: the actor's own (with their conditions) and those its
  items give their bearer while worn (a race's resistance, a ring's +1 AC)
  become effects whose `changes` are ours (ability scores, AC, hit points,
  speed, initiative, saves, resistances and immunities).

### What stays behind

The import lists it all, grouped by kind with how many and where ("907
Monk's Active Tiles actions we have no match for, in 74 scenes"); the terminal import
prints the same list. Mainly:

- Foundry's automation: effect changes on keys we have no match for
  (Midi-QOL and DAE flags, macros), and item effects that land on a target
  when the item is used.
- Items in the Items sidebar that the Compendium already has (the SRD's,
  by name) or that live only on sheets (features, classes); the world's
  own spells and gear become the game's homebrew, with Foundry's ownership.
- Card stacks, chat, combats and the explored fog.
- Foundry users' passwords (Foundry keeps only hashes): give your players
  new ones on the game's page.
- Each user's explored fog.
- Data that other Foundry modules keep in `flags` (other than Monk's
  Active Tiles, Levels and 3D Canvas).
- Sheets of other Foundry systems: their actors keep only their name and
  picture, everything else still comes along.

## How the import is built

`server/src/foundry/foundry-world.ts` reads the world (`foundry-world-read.ts`)
and runs `WORLD_PARTS` (`world-parts.ts`) in order: folders, journal entries
and the rest of the sidebar, macros, actors, scenes, time, and what stays
behind. Each part reads the Foundry documents and what earlier parts made
(our ids for Foundry's folders, entries and actors) and adds files to the
game; a Foundry collection or a module's flags to bring along is a new part.
Converters say what they could not bring as `ImportLoss` values (a kind, a
count, some names), which `import-losses.ts` groups for the report.

## Not done yet

- A module's ready-made Adventure as a game (its scenes, journals, tables and
  playlists go into an asset pack today).
- Uploading a world as a zip from the browser, for a server on another
  computer.
