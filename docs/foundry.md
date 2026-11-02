# Coming from Foundry VTT

Two imports read Foundry's files directly: Foundry doesn't have to run (it can
stay open), no Foundry module is needed, and nothing in the Foundry folder is
changed. Both read every Foundry version's databases: the NeDB `.db` files of
v10 and before, and the LevelDB folders of v11 and later (a small reader of
our own, `server/src/leveldb.ts`, so no native module is installed).

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
pnpm import-foundry-world <world folder> [--name <game name>] [--data <Foundry Data folder>] [--gm <account>]
```

(the GM is the server's admin unless `--gm` names an account; a running
server lists the game after a restart).

What comes along:

- **Scenes**, all of them, the active one as the game's scene: background,
  tiles, walls and doors, lights, drawings, map notes, measured templates,
  ambient sounds and regions (see "Importing from Foundry VTT" in packs.md
  for how each is read), and the scene's playlist.
- **Foundry v14** scenes: the background comes from the lowest floor that
  has one (v14 keeps it in the scene's `levels`), templates that v14 stores
  as regions become templates again, and 3D Canvas model tiles (blank
  squares in 2D) are left out.
- **Tokens** on their actors: a linked token stays linked; an unlinked one
  becomes a copy whose own name, picture, size and hit points go in its
  `delta`. Hidden tokens stay hidden. A token whose actor is gone carries
  its name and picture itself.
- **Actors**, in their folders ("Monsters / Goblins"), with their token art.
  A player-visible actor (Foundry's default Observer or Owner) keeps that
  level for everyone; the GM gives characters to their players in the
  Players tab. The sheet is read by the game system (see below).
- **Journal entries** (text and image pages), **roll tables** and
  **playlists**, in their folders.
- **Pictures and sounds** those use, copied into the game's
  `assets/foundry/` under their Foundry path. Foundry names files by their
  place in its Data folder, so a map in `Data/assets/` is found too: the
  Data folder is the one the world sits in (`Data/worlds/<world>`), or the
  one given.
- The **rules edition**: a dnd5e world set to the modern rules plays 2024.

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

### What stays behind

The import lists it all; mainly:

- Spells the SRD doesn't have, a second class (one class per sheet here:
  the levels are added up), active effects and Foundry's automation.
- Items in the Items sidebar (drag items from the Compendium instead),
  macros, card stacks, chat, combats and the explored fog.
- Foundry users and their passwords: invite your players with the game's
  invite link.
- Data that Foundry modules keep in `flags` (Levels, Monk's, Tagger...).
- Sheets of other Foundry systems: their actors keep only their name and
  picture, everything else still comes along.

## Not done yet

- A module's ready-made Adventure as a game (its scenes, journals, tables and
  playlists go into an asset pack today).
- Uploading a world as a zip from the browser, for a server on another
  computer.
