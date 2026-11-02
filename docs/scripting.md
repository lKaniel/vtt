# Scripting

Script macros let the GM run JavaScript at the table, like Foundry's
script macros. A script talks to the game through **`vtt`**, the
scripting API. It listens for things that happen through **hooks**. Plugins
([plugins.md](plugins.md)) get the same API.

## Script macros

In the Macros tab, the GM sets a macro to **Script** and writes
JavaScript in place of chat lines. The code runs in the GM's own browser,
as the body of an `async` function, so it may `await`. It has two names
in scope:

| Name    | What it is                                                    |
| ------- | ------------------------------------------------------------- |
| `vtt`   | the scripting API (below)                                     |
| `token` | the id of the creature it was run for (the hotbar's), or null |

```js
// Every creature the GM can see rolls a d20, by name.
for (const t of vtt.tokens()) vtt.chat(`/r 1d20 ${t.name}`);
```

A script can do only what its GM could do by clicking. It acts by
sending the same messages the table's screens send, and the server checks
each one. If a script throws, the error shows as a notice named after the
macro, and the table keeps running.

The GM alone writes, sees and runs script macros. A player is never sent
one, even a shared one, and the server refuses to let a player create a
script macro or turn a chat macro into one. So no player can put code in
front of the GM. Switching a macro to Script also stops sharing it.

While a table is open, `vtt` is on the page too, so the GM can try calls
in the browser console.

## The `vtt` API

| Call                                  | Does                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `vtt.user()`                          | your seat: `{ id, name, role }`                                                |
| `vtt.isGm()`                          | whether you are the GM                                                         |
| `vtt.tokens()`                        | the creatures on your scene that you can see                                   |
| `vtt.token(idOrName)`                 | one creature, by id or else by name                                            |
| `vtt.selected()`                      | the creature you have selected                                                 |
| `vtt.targets()`                       | your targets' ids                                                              |
| `vtt.chat(text)`                      | says it in chat as if typed: words, or `/r 2d6+3`                              |
| `vtt.move(id, x, y)`                  | walks a creature to a point (pixels), as a drag would                          |
| `vtt.docs(coll)`, `vtt.doc(coll, id)` | documents you were sent: `macros`, `journals`, `actors`, `scenes/<id>/tiles` … |
| `vtt.edit(ops, label?)`               | creates, updates and deletes documents in one undo step (`docs/edits.md`)      |
| `vtt.update(coll, id, patch, label?)` | changes some fields of one document                                            |
| `vtt.notify(text)`                    | shows a notice                                                                 |
| `vtt.runMacro(idOrName, token?)`      | runs another macro                                                             |
| `vtt.send(message)`                   | sends any client message (`client-messages.ts`): `{ t: 'endTurn' }` …          |
| `vtt.hooks.on/once/off(hook, fn)`     | listens for a hook; `on` and `once` return the function that stops it          |

## Hooks

| Hook        | Called with          | When                                    |
| ----------- | -------------------- | --------------------------------------- |
| `ready`     |                      | you joined the table (or rejoined)      |
| `chat`      | the chat message     | a chat message arrives                  |
| `combat`    | the fight, or null   | a fight starts, ends or moves on a turn |
| `token`     | the creature         | a creature appears or changes           |
| `tokenGone` | its id               | a creature leaves your view             |
| `moved`     | its id, the path     | a creature walks                        |
| `select`    | its id, or undefined | you select a creature                   |
| `targets`   |                      | your targets or someone else's change   |
| `time`      |                      | the time of day changes                 |

```js
// Say who is up whenever the turn moves on.
vtt.hooks.on('combat', (fight) => {
  const up = fight && vtt.token(fight.order[fight.turn].token);
  if (up) vtt.notify(`${up.name}'s turn`);
});
```

A listener that throws is reported, and the other listeners still run.
Hooks last until the table is closed, so a script that runs twice
listens twice. Keep the function `on` returns if you need to stop
listening.

## Code

The code lives in `packages/client/src/scripting/`. `hooks.ts` has the
hooks, `run-script.ts` runs the code, and `script-api.ts` has `vtt`, the
hooks that pass session news on, and the runner. The server side is in
three places:

- `op-permissions.ts`: only the GM writes scripts.
- `doc-visibility.ts`: only the GM is sent them.
- `macro-actions.ts`: a script never runs on the server.
