# Games and the lobby

One server runs many games. Each is a folder in the [game format](game-format.md):

- The **home game** is the folder the server was started with: `world/` by
  default, or the folder given on the command line or in `VTT_GAME`. It stays
  where it is, so hand edits (and Claude's) keep working, and the lobby can't
  delete it. It is open to every account, and its fixed seats can still be
  taken without an account (`?player=` / _Take a seat without an account_).
- Games made in the lobby live in `data/games/<id>/` (next to the home game's
  folder, or in `VTT_DATA`). Their id comes from the name.

A game is loaded when someone needs it (a player connects or the lobby
changes it) and unloaded five minutes after its last player has left. Hand
edits to a loaded game hot-reload as before; an unloaded game simply reads its
files the next time it loads.

`data/games.json` keeps what the server knows about each game besides its
folder: the invite code, whether it is open to every account, and when it was
last played. It is the server's, not the game's, so copying a game folder to
another server doesn't copy its invite.

## Members

A game's members are its seats (`players` in `game.json`): an account's seat
has the account's id. Joining adds a seat; the game's GMs change roles and
remove members from the game's page, or the Players tab at the table. A game
always keeps at least one GM. Anyone can leave a game, except its only GM.
Removing a member disconnects them, keeps their characters in the game as
actors, and deletes their explored fog.

Who sees a game in the lobby: its members, every account when the game is
_open to everyone on this server_, and the server's admin (the first account),
who can also delete any lobby game.

## Invites

The GM makes an invite link on the game's page (`/#/invite/<code>`). Anyone
who opens it joins as a player, signing in or making an account first if they
need to. _New link_ replaces the code, so the old link stops working. Pasting
a link or just its code into _Join a game_ does the same.

## Entering a game

_Enter the game_ takes your seat and, if you pick one, brings a roster
character in as a linked actor you own (or updates the one already there).
The game connection is `/ws?game=<id>`, signed in by the session cookie; a
game's own pictures are served at `/games/<id>/assets/` (the home game's also
at `/assets/`).

## HTTP API

All under `/api/`, signed in:

| Call                                                    | Who                  | Does                                                                              |
| ------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `GET games`                                             | anyone               | your games and open ones, and the systems                                         |
| `POST games` `{name, system, rules}`                    | anyone               | makes a game with you as GM                                                       |
| `POST games/import-foundry` `{folder, name?, dataDir?}` | the admin            | makes a game from a Foundry world on the server's disk ([foundry.md](foundry.md)) |
| `GET games/<id>`                                        | who can see it       | members (who is online), the invite for GMs                                       |
| `DELETE games/<id>`                                     | GM, admin            | deletes a lobby game, files and all                                               |
| `POST games/<id>/join` `{character?}`                   | member, or open game | takes your seat, brings the character                                             |
| `POST games/<id>/invite`                                | GM                   | a new invite code                                                                 |
| `PUT games/<id>/open` `{open}`                          | GM                   | open to every account, or not                                                     |
| `PUT games/<id>/members/<account>` `{role}`             | GM                   | changes a role                                                                    |
| `DELETE games/<id>/members/<account>`                   | GM, or yourself      | removes a member                                                                  |
| `POST invites/<code>`                                   | anyone               | joins the game as a player                                                        |

Code: `server/src/game-hub.ts` (games, loading, invites), `lobby-api.ts`
(the routes), `socket-join.ts` (who a connection is), `shared/src/lobby.ts`
(new-game checks, member changes), `server/src/systems.ts` (the systems a
game can run on), client `ui/LobbyScreens.tsx` and
`ui/GamePage.tsx`.

## Not done yet

- Seat passwords and approving join requests (an invite link seats at once).
- Backing a game up from the lobby (copy its folder).
- Asset packs per game (a later step), and a system other than D&D 5e (the
  seam is in place, see [systems.md](systems.md)).
