# Games and the lobby

One server runs many games. Each is a folder in the [game format](game-format.md):

- The **home game** is the folder the server was started with: `world/` by
  default, or the folder given on the command line or in `VTT_GAME`. It stays
  where it is, so hand edits (and Claude's) keep working, and Setup can't
  delete it.
- Games made in Setup live in `data/games/<id>/` (next to the home game's
  folder, or in `VTT_DATA`). Their id comes from the name.

A game is loaded when someone needs it (a player connects or the lobby
changes it) and unloaded five minutes after its last player has left. Hand
edits to a loaded game hot-reload as before; an unloaded game simply reads its
files the next time it loads.

`data/games.json` keeps what the server knows about each game besides its
folder: its players' passwords and Claude keys (hashed), and when it was last
played. It is the server's, not the game's, so copying a game folder to
another server doesn't copy the passwords.

## Joining a game (Foundry style)

There are no accounts. The main page lists every game on the server; picking
one opens its **join screen**, where you pick your player from the game's
players (`players` in `game.json`) and give that player's password if it has
one. Your browser's session (the `vtt_session` cookie, `data/sessions.json`)
remembers the player you joined each game as, so the game connection
(`/ws?game=<id>`) needs nothing more. _Switch player_ on the game's page
forgets it.

A game's page has the door to the table, your characters there, your key for
Claude, and the game's players. Its GM (or the server's admin) adds players
(a name, a role, an optional password), changes their roles and passwords and
removes them; anyone may set their own password. A game always keeps at least
one GM. Removing a player disconnects them, keeps their characters in the
game as actors, and deletes their explored fog. The in-game Players tab can
add players too.

## Setup and the admin password

**Setup** makes, imports and deletes games. It is behind the server's admin
password: set in Setup (stored as a salted scrypt hash in `data/admin.json`)
or by `VTT_ADMIN_PASSWORD` (which then wins and can't be changed in Setup).
Without one, Setup is open to anyone who reaches the server. Whoever gives
the admin password may also manage every game's players and backups, without
joining it.

A new game (made, imported from a zip or from a Foundry world) starts with a
`Gamemaster` player without a password, and the browser that made it joins
as that player. A zip keeps its game's players (not their passwords).

## Characters

Characters belong to a game and the player who made them there
(`data/characters/<id>.json`, with `game` and `owner`). The character creator
and level-up are reached from the game's page. _Enter the game_ can bring one
onto the map as a linked actor the player owns (or update the one there).

## Servers from before (accounts)

A server that still has `data/accounts/` is carried over once on start
(`migrate-accounts.ts`), then that folder is renamed `accounts-old/`: the
admin account's password becomes the admin password; each account's password
becomes its player's password in every game it sat in (a seat had the
account's id), and its Claude key that player's key; signed-in browsers stay
signed in as those players; roster characters move into the game that has
them as an actor, else their owner's home or first game.

## Backups and zip files

A game is backed up into `data/backups/<game>/<when>/` when it loads, every
15 minutes while it is loaded, and when its GM presses _Back up now_; the
automatic ones only when something changed since the last. The last 20 are
kept. Pictures (`assets/`) are left out of backups: they are big and play
doesn't change them. _Restore_ on the game's page puts one back: the game as
it is now is backed up first (so a restore can itself be undone), everyone
connected is reconnected, and the game loads from the restored files.

_Download as zip_ gives the GM the whole game folder, pictures and all.
_Import a game_ in the lobby makes a new game from such a zip, with whoever
imports it as its only seat (the GM); `game.json` may sit at the zip's root
or in one folder inside it.

## HTTP API

All under `/api/`, signed in:

| Call                                                    | Who                | Does                                                                              |
| ------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `GET session`                                           | anyone             | whether this browser may use Setup, whether there is an admin password, home game |
| `POST admin` `{password}`                               | anyone             | opens Setup with the admin password                                               |
| `PUT admin` `{password}`                                | admin              | a new admin password, or (null) none                                              |
| `DELETE admin`                                          | anyone             | closes Setup on this browser                                                      |
| `POST logout`                                           | anyone             | forgets every game this browser joined                                            |
| `GET games`                                             | anyone             | every game, and the systems                                                       |
| `POST games` `{name, system, rules}`                    | admin              | makes a game, joined as its Gamemaster                                            |
| `POST games/import-foundry` `{folder, name?, dataDir?}` | admin              | makes a game from a Foundry world on the server's disk ([foundry.md](foundry.md)) |
| `POST games/import-zip` (zip body)                      | admin              | makes a game from an exported zip                                                 |
| `GET games/<id>`                                        | anyone             | its players (who is online, who has a password), the one you joined as            |
| `DELETE games/<id>`                                     | admin              | deletes a game, files and all                                                     |
| `POST games/<id>/join` `{player, password}`             | anyone             | joins as that player                                                              |
| `POST games/<id>/leave`                                 | anyone             | forgets the player this browser joined as                                         |
| `POST games/<id>/players` `{name, role, password?}`     | GM, admin          | adds a player                                                                     |
| `PUT games/<id>/players/<player>` `{role}`              | GM, admin          | changes a role                                                                    |
| `DELETE games/<id>/players/<player>`                    | GM, admin          | removes a player                                                                  |
| `PUT games/<id>/players/<player>/password` `{password}` | GM, admin, oneself | a password on a player, or (null) none                                            |
| `GET/POST games/<id>/characters`, `PUT/DELETE …/<c>`    | a joined player    | your characters at the game                                                       |
| `POST games/<id>/bring` `{character}`                   | a joined player    | brings your character onto the map                                                |
| `GET games/<id>/homebrew`                               | a joined player    | the GM's homebrew classes you may build with                                      |
| `GET/POST/DELETE games/<id>/mcp-key`                    | a joined player    | your key for Claude at the game                                                   |
| `GET games/<id>/backups`                                | GM, admin          | the backups, newest first                                                         |
| `POST games/<id>/backups`                               | GM, admin          | backs up now                                                                      |
| `POST games/<id>/backups/<backup>/restore`              | GM, admin          | puts a backup back (backing up the game as it is first)                           |
| `GET games/<id>/export`                                 | GM, admin          | the game folder as a zip                                                          |

Code: `server/src/http/sessions.ts` (sessions, admin password), `lobby-api.ts`
(games, joining, players), `character-api.ts` (characters, Claude keys),
`game-hub.ts` (games, loading), `socket-join.ts` (who a connection is),
`game-access.ts` (player passwords, Claude keys), `migrate-accounts.ts`,
`backups.ts` and `game-archive.ts` (backups, zips), `shared/src/lobby.ts`
(new-game and new-player checks, player changes), `server/src/systems.ts`
(the systems a game can run on), client `ui/MenuScreens.tsx` (games, join
screen), `ui/LobbyScreens.tsx` (Setup) and `ui/GamePage.tsx`.

## Not done yet

- Importing a Foundry world's users as players.
- A system other than D&D 5e (the seam is in place, see [systems.md](systems.md)).
