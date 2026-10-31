# World format

A world is a folder of JSON files. The server loads it on start, watches it,
and writes game changes (token moves, doors) back to it. Editing a file by
hand or with Claude updates every connected client live.

```
world/
  world.json          settings and players
  chunks/<cx>_<cy>.json   map content, one file per chunk
  tokens/<id>.json    one file per token
  actors/<id>.json    the GM's Actors list: creatures ready to be placed
  combat.json         the fight in progress, if any
  assets/             images referenced by tiles and tokens
```

Run `pnpm check-world` after editing. It reports every problem with the file
and field it's in. The schemas live in `packages/shared/src/schema.ts`.

## Coordinates

Everything is in **pixels** on one unbounded plane. `x` grows right, `y`
grows down, negative values are fine.

- `gridSize` pixels make one 5 ft square (default 100).
- `chunkSize` pixels make one chunk side (default 2000, so 20 by 20 squares).
- The square at column `c`, row `r` spans `c*gridSize` to `(c+1)*gridSize`.
  Its centre is `(c + 0.5) * gridSize`. Tokens stand on square centres, so
  with `gridSize: 100` a token sits at `x: 550`, not `x: 500`.
- Walls run along square edges, so their ends are multiples of `gridSize`.

## world.json

```json
{
  "name": "The crossroads",
  "gridSize": 100,
  "chunkSize": 2000,
  "start": [1000, 900],
  "players": [
    { "id": "gm", "name": "GM", "role": "gm", "color": "#e0b040" },
    { "id": "player1", "name": "Player 1", "role": "player", "color": "#5a9be0" }
  ]
}
```

At least one player must have `"role": "gm"`. `start` is where the camera
opens, and where characters joining from an account appear. Changing this
file reconnects everyone.

Players whose `id` matches an account (see the README) are that account's
seat. The server adds one when an account first joins, so you can change its
`role` here afterwards. A character brought from an account becomes a token
whose `id` is the character's id, with the account in `controllers`; saving
or levelling the character updates that token's name, stats and senses.

## Chunks

A chunk file holds the tiles and walls of one `chunkSize` square of the map.
The file name is the chunk's column and row: `0_0.json` covers pixels 0 to
1999 on both axes, `-1_0.json` covers x -2000 to -1, and so on. Coordinates
inside the file are **absolute** map pixels, not relative to the chunk.

Put each item in the chunk where it starts (a tile's top-left corner, a
wall's midpoint). The checker warns when one is in the wrong file.

```json
{
  "tiles": [
    { "kind": "rect", "id": "grass", "x": 0, "y": 0, "w": 2000, "h": 2000, "color": "#4f6b3a" },
    { "kind": "image", "id": "tavern", "x": 400, "y": 200, "w": 800, "h": 600, "src": "maps/tavern.webp" }
  ],
  "walls": [
    { "id": "tavern-n", "a": [400, 200], "b": [1200, 200] },
    { "id": "tavern-door", "a": [700, 800], "b": [800, 800], "door": "closed" }
  ]
}
```

- Tiles draw in file order, later ones on top. `image` tiles load from
  `assets/`.
- A wall is a line from `a` to `b` that blocks movement. Add `door` to make
  it a door: `"closed"`, `"open"` or `"locked"`. Open doors don't block.
- Ids must be unique within the chunk.

## Tokens

```json
{
  "id": "bram",
  "name": "Bram",
  "x": 650,
  "y": 650,
  "size": 1,
  "color": "#c0603a",
  "speed": 30,
  "controllers": ["player2"],
  "hidden": false
}
```

| Field         | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| `id`          | Lowercase letters, digits, dashes. Must match the file name.        |
| `x`, `y`      | Centre of the token in pixels (a square centre).                    |
| `size`        | In squares: 1 medium, 2 large, 3 huge. Default 1.                   |
| `color`       | Disc colour behind the placeholder when there is no picture.        |
| `img`         | Picture URL, drawn as-is: use a top-down cut-out with transparency. |
| `speed`       | Walking speed in feet. Default 30.                                  |
| `controllers` | Player ids who may move it. The GM always can.                      |
| `hidden`      | `true` = only the GM sees it.                                       |
| `visibleTo`   | If set, only these players (and the GM) see it. Used for illusions. |

A token with a `monster` and no `img` uses that monster's painted token, if one
has been imported (see [token-art/README.md](token-art/README.md)).

## Creatures: stats, monsters and gear

A token with `monster` or `stats` is a creature: it gets a hit point bar, can
attack and joins fights. Monster and item ids come from the SRD content in
`packages/shared/content/srd/`.

**Rules edition.** `world.json` has `"rules": "2014"` (the default) or
`"2024"`. Monsters come from SRD 5.1 (`monsters-5.1.json`) under 2014 rules
and SRD 5.2 (`monsters-5.2.json`) under 2024 rules; the weapon and armor list
(`items.json`) is shared. A character can play by the other edition, e.g. a
2024 class in a 2014 game, with `"stats": { "rules": "2024" }`; that token's
monster id and rules then come from that edition.

A monster uses the stat block as is. Anything in `stats` overrides it, and
`hp` tracks damage (leave it out for an unhurt creature):

```json
{ "id": "goblin-1", "name": "Goblin", "x": 2850, "y": 1650, "monster": "goblin", "hp": 4 }
```

A character is built from `stats` and the gear it has equipped. AC comes from
worn armor and shield, attacks from equipped weapons (finesse weapons use the
better of STR and DEX, ranged weapons DEX), proficiency from `level`:

```json
{
  "id": "bram",
  "name": "Bram",
  "x": 650,
  "y": 650,
  "controllers": ["player2"],
  "stats": {
    "class": "Fighter",
    "level": 3,
    "maxHp": 28,
    "abilities": { "str": 16, "dex": 12, "con": 14, "int": 10, "wis": 12, "cha": 8 }
  },
  "inventory": [
    { "item": "longsword", "equipped": true },
    { "item": "chain-mail", "equipped": true },
    { "item": "shield", "equipped": true },
    { "item": "potion-of-healing", "qty": 2 }
  ]
}
```

| `stats` field                                  | Meaning                                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level`                                        | Character level, sets proficiency.                                                                                                                   |
| `class`                                        | Shown on the character sheet.                                                                                                                        |
| `abilities`                                    | `str dex con int wis cha` scores; missing ones are 10 (or the monster's).                                                                            |
| `maxHp`                                        | Hit point maximum.                                                                                                                                   |
| `ac`, `proficiency`                            | Override the computed values.                                                                                                                        |
| `attacks`                                      | Extra attacks: `{ "name", "kind": "melee"\|"ranged", "toHit", "reach" or "range": [normal, long], "damage": [{ "dice": "1d6+2", "type": "fire" }] }` |
| `resistances`, `immunities`, `vulnerabilities` | Damage types, e.g. `["fire"]`.                                                                                                                       |

**Spells and features.** `stats.spells` lists the spell ids a character
knows or has prepared (from `spells-5.1.json` or `spells-5.2.json`, by the
token's edition). A `class` named after an SRD class (Wizard, Fighter, ...)
gives that class's spell slots, spellcasting ability and features by `level`,
from `classes-5.x.json`. A homebrew class or a monster that casts uses
`"spellcasting": { "ability": "int", "progression": "full" | "half" | "pact", "level": 5 }`.

```json
"stats": {
  "class": "Wizard",
  "level": 3,
  "abilities": { "int": 16, "dex": 14, "con": 14 },
  "spells": ["fire-bolt", "magic-missile", "shield", "misty-step"]
}
```

The server writes the rest of a creature's magic to its token file, and you can
edit it too:

| Token field     | Meaning                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effects`       | What is affecting it now: `[{ "id", "name", "rounds"?, "source"?, "concentration"?, ...modifiers }]`.                                                                 |
| `concentration` | `{ "spell", "name" }`: the spell it concentrates on. Ending it ends that spell's effects and summons.                                                                 |
| `spent`         | `{ "slots": [1, 0], "uses": { "second-wind": 1 } }`: slots per level (index 0 = 1st) and feature uses.                                                                |
| `summon`        | `{ "by", "spell", "concentration" }`: brought in by a spell; it vanishes when the spell ends.                                                                         |
| `hotbar`        | How its player arranged the action bar: one entry per slot, `"spell:fire-bolt"`, `"attack:Longsword"`, `"feature:second-wind"`, `"item:potion-of-healing"` or `null`. |
| `leader`        | Token id it acts with: it moves and attacks on its leader's turn instead of having its own (pets, summons).                                                           |

Effect modifiers: `conditions` (e.g. `["prone"]`, `["paralyzed"]`),
`attackBonus` and `saveBonus` (dice like `"1d4"` or `"-1d4"`), `ac`, `speed`,
`resistances`, `advantage`, `disadvantage`, `advantageAgainst`,
`disadvantageAgainst`, `meleeDamage`, `saveAdvantage`. Lifetime: `rounds`
counts down at the start of the `source` creature's turn; `once` ends it the
first time it changes an attack; `repeatSave` with `save: { "ability", "dc" }`
lets the bearer save again at the end of each of its turns; `endsOnAttack`
ends it when the bearer attacks or casts. A hidden trap or a GM ruling can
just write an effect into the token file.

Players only receive the stats of tokens they control. For everyone else
they're told how hurt the creature looks (unhurt, hurt, bloodied, down).

## Actors

`actors/` holds the GM's Actors list: creatures that aren't on the map yet.
An actor is a token without `x` and `y`, plus an optional `folder` that
groups it in the list. Dragging one onto the map in the game copies it into
`tokens/` with a free id (`bandit`, `bandit-2`, ...) and a numbered name.

```json
{ "id": "bandit", "name": "Bandit", "folder": "Road", "monster": "bandit" }
```

The GM also places SRD monsters straight from the Compendium, and can save
any token as an actor. Both write these files, and `check-world` checks
actors like tokens.

## combat.json

Written by the server while a fight is on, deleted when it ends. You can write
it to set up an encounter that starts mid-fight:

```json
{
  "round": 1,
  "turn": 0,
  "order": [
    { "token": "goblin-1", "initiative": 17 },
    { "token": "bram", "initiative": 12 }
  ],
  "left": { "move": 30, "action": true, "bonus": true, "attacks": 0, "used": [] },
  "side": {}
}
```

`turn` is the index in `order` of the creature acting now; `left` is what it
has left this turn (feet of movement, action, bonus action, attacks left in an
Attack action, once-per-turn things already used like sneak attack). `side`
holds the same for creatures acting on this turn through `leader`, by id.
