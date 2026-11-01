# Edits, undo and the clipboard

Every change to a game is a transaction of document ops (`packages/core`):
create, update or delete one document in a collection (`game`, `scenes`,
`actors`, `combat`, `<scene>/tiles|walls|lights|tokens`). This page is how
the pieces fit; see the design doc for why.

## The protocol

Client to server:

- `{ t: 'ops', txn, label?, ops }`: one edit, all or nothing, allowed by
  ownership (see below). The server checks every
  document against the schema of the file it is saved in (`doc-checks.ts`),
  so an edit can't write a file the server would refuse to load. Deleting an
  actor first leaves its tokens carrying its sheet, as `deleteActor` does.
- `{ t: 'undo', card? }` and `{ t: 'redo' }`.
- Game actions (`move`, `attack`, `cast`, `rest`, ...) and the older GM
  intents (`editToken`, `spawn`, `mapEdit`, `darkness`, ...) stay as they
  are: the server runs the rules and turns them into ops itself.

Server to client:

- `docs`: the documents a transaction changed, as they are now (no `doc`
  means deleted, or no longer yours to read), with who did it and the
  client's `txn`. The welcome carries the documents you may read (`docs`):
  the GM gets all of them, a player the actors and tokens they observe or
  own and can see (`doc-feed.ts`). Players also keep their filtered views
  (`token`, `chunk`); the map's documents follow with server fog (step 8).
- `reject`: the `ops` transaction was refused; nothing in it applied.
- `history`: what Ctrl+Z and Ctrl+Shift+Z would undo or redo now, and for
  GMs the chat card of the latest game action.
- `undone`, `chatUndone`: an undo went through; cards marked undone.

## Who may change what

`op-permissions.ts` checks every op against its sender's ownership levels
(`permissions.ts`). The GM may do anything. Anyone else:

- may only update documents, never add or remove them;
- never changes `ownership`, `x`/`y`, `hidden`, `visibleTo`, `summon`,
  `leader`, `actor` or `linked` (moves go through the `move` intent, which
  runs the rules);
- may change `hotbar` on what they own (`canControl`), and anything else on
  what they own only from a `trusted` seat (`canEdit`);
- has an unlinked token's `delta` checked field by field, as if it were the
  token's own fields.

Map items, scenes, the game and the fight have no ownership yet, so they stay
the GM's.

## Undo

Each message a client sends is one step: whatever it changed in the
documents, however many commits that took (`GameStore.record`). A step keeps,
per document, how it was before and the revision it left it at
(`ChangeLog`, `revertOps` in core). Undo puts all of them back in one
transaction and is refused, naming who, if any has moved on since. Redo is
undoing the undo.

- Edits (the `ops` message and the GM intents) go in their sender's
  history, 100 steps, kept by the server so a reload keeps them.
- Game actions go in one shared list that only the GM can undo: Ctrl+Z
  takes whichever is newer, the GM's own edit or the latest action, and the
  latest action's chat card has an Undo button. Dice are not rolled again.
- Undo is an edit like any other: a player may undo only what they could
  change by hand now (the same check as `ops`), so taking a creature away
  from them also takes away undoing their edits to it.
- Hand edits of the files are not undoable steps, but they count as a
  change: undoing over one says "someone editing the files has changed …".

## Copy, cut, paste, duplicate, delete

`EDIT_KINDS` in `shared/edit-kinds.ts` says, for each document type, which
collection it goes in, which fields point at other documents (`actor`,
`leader`, `summon.by`) and how it moves. `copyDocs`, `pasteOps` and
`deleteOps` in core do the rest for every type:

- Copy takes a document and everything whose `parent` is it.
- Paste gives every document a fresh id (its own if free, else the next
  number) and points links inside the copy at the new copies; links to
  things outside stay (a pasted goblin still uses the Goblin actor). Pastes
  land at the pointer, moved by whole squares.
- Cut is copy plus delete in one transaction; duplicate pastes one square
  over.
- The copy travels as JSON with a `vtt/documents` marker, through the
  system clipboard, so it pastes into another scene or browser tab.

A new type (step 6 onwards: drawings, notes, regions...) adds itself to
`EDIT_KINDS` and a sample to `server/src/edit-commands.test.ts`, which runs
every kind through copy then paste, cut then undo, delete then undo then
redo, and duplicate.

## Step 13 hook

The game clock will be a field of the `game` document, so skipping time is
an ordinary edit and undoes like one.
